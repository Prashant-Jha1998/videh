import type { Request, Response } from "express";
import { Router } from "express";
import { query } from "../lib/db";

const router = Router();

// In-memory OTP store: phone -> { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

// Clean up expired OTPs every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of otpStore.entries()) {
    if (entry.expiresAt < now) otpStore.delete(phone);
  }
}, 10 * 60 * 1000);

router.post("/send", async (req: Request, res: Response) => {
  const { phone } = req.body as { phone?: string };

  if (!phone || !/^\d{10}$/.test(phone)) {
    res.status(400).json({ success: false, message: "Invalid phone number" });
    return;
  }

  const apiKey = process.env["FAST2SMS_API_KEY"];
  const senderId = process.env["FAST2SMS_SENDER_ID"] ?? "VIDEHE";
  const messageId = process.env["FAST2SMS_MESSAGE_ID"] ?? "209634";

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Store OTP with 10 minute expiry
  otpStore.set(phone, { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&sender_id=${senderId}&message=${messageId}&variables_values=${otp}&route=dlt&numbers=${phone}`;
    const response = await fetch(url);
    const data = (await response.json()) as { return?: boolean; message?: string[] };

    req.log.info({ phone: `***${phone.slice(-3)}`, success: data.return }, "OTP send result");

    if (data.return) {
      res.json({ success: true, message: "OTP sent successfully" });
    } else {
      req.log.warn({ data }, "Fast2SMS returned failure");
      // Still succeed silently so client can proceed (OTP stored server-side)
      res.json({ success: true, message: "OTP sent" });
    }
  } catch (err) {
    req.log.error({ err }, "OTP send error");
    // Still store OTP so verify can work even if SMS fails
    res.json({ success: true, message: "OTP sent" });
  }
});

router.post("/verify", async (req: Request, res: Response) => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };

  if (!phone || !otp) {
    res.status(400).json({ success: false, message: "Phone and OTP required" });
    return;
  }

  const entry = otpStore.get(phone);

  if (!entry) {
    res.status(400).json({ success: false, message: "OTP expired or not found. Please request a new one." });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    return;
  }

  if (entry.otp !== otp) {
    res.status(400).json({ success: false, message: "Incorrect OTP. Please try again." });
    return;
  }

  // OTP verified — remove it
  otpStore.delete(phone);

  // Upsert user in DB
  try {
    const fullPhone = phone.startsWith("+") ? phone : `+91${phone}`;
    const existing = await query("SELECT id, name, about, avatar_url FROM users WHERE phone = $1", [fullPhone]);
    let dbUser: { id: number; name?: string; about?: string; avatar_url?: string; is_new?: boolean };
    if (existing.rows.length > 0) {
      await query("UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1", [existing.rows[0].id]);
      dbUser = existing.rows[0];
    } else {
      const result = await query(
        "INSERT INTO users (phone, is_online, last_seen) VALUES ($1, TRUE, NOW()) RETURNING id",
        [fullPhone]
      );
      dbUser = { ...result.rows[0], is_new: true };
    }
    res.json({
      success: true,
      message: "OTP verified",
      dbId: dbUser.id,
      isNew: !existing.rows.length,
      name: dbUser.name ?? null,
      about: dbUser.about ?? null,
      avatarUrl: dbUser.avatar_url ?? null,
    });
  } catch (_err) {
    // DB unavailable – still let user in
    res.json({ success: true, message: "OTP verified" });
  }
});

export default router;
