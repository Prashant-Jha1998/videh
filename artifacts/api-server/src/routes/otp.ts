import type { Request, Response } from "express";
import { Router } from "express";
import { query } from "../lib/db";
import { issueSessionToken } from "../lib/auth";
import { clientIp, isRateLimited } from "../lib/rateLimit";
import {
  activeLockExpiry,
  clearLoginGuard,
  generateOtp6,
  readLoginGuard,
  registerLoginFailure,
  retryAfterSeconds,
  secretMatches,
} from "../lib/loginAttemptGuard";
import {
  isPlayStoreDemoPhone,
  playStoreDemoOtp,
  playStoreDemoOtpMatches,
} from "../lib/playStoreDemo";
import { suspendDeveloperApiForConsumerAppLogin } from "../lib/developerChannel";
import { stateDelete, stateGetJson, stateSetJson } from "../lib/sharedState";

const router = Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_SCOPE = "otp";
const otpKey = (phone: string) => `otp:${phone}`;

type OtpRecord = {
  otp: string;
  expiresAt: number;
};

function normalizePhone10(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return null;
}

function lockResponse(res: Response, lockedUntil: number) {
  const sec = retryAfterSeconds(lockedUntil);
  res.status(429).json({
    success: false,
    locked: true,
    retryAfterSeconds: sec,
    message: `Too many wrong attempts. Try again in ${Math.ceil(sec / 60)} minutes or request a new OTP.`,
  });
}

router.post("/send", async (req: Request, res: Response) => {
  const phoneRaw = (req.body as { phone?: string }).phone ?? "";
  const phone = normalizePhone10(phoneRaw);

  if (!phone) {
    res.status(400).json({ success: false, message: "Invalid phone number" });
    return;
  }

  const isDemo = isPlayStoreDemoPhone(phone);

  const ip = clientIp(req);
  if (!isDemo && isRateLimited(`otp-send:ip:${ip}`, 25, 60 * 60 * 1000)) {
    res.status(429).json({ success: false, message: "Too many OTP requests. Please wait and try again." });
    return;
  }
  if (!isDemo && isRateLimited(`otp-send:phone:${phone}`, 5, 60 * 60 * 1000)) {
    res.status(429).json({ success: false, message: "OTP limit reached for this number. Try again later." });
    return;
  }

  const guard = await readLoginGuard(OTP_SCOPE, phone);
  const locked = activeLockExpiry(guard);
  if (!isDemo && locked) {
    lockResponse(res, locked);
    return;
  }

  const apiKey = process.env["FAST2SMS_API_KEY"];
  const senderId = process.env["FAST2SMS_SENDER_ID"] ?? "VIDEHE";
  const messageId = process.env["FAST2SMS_MESSAGE_ID"] ?? "209634";

  const otp = isDemo ? (playStoreDemoOtp() ?? generateOtp6()) : generateOtp6();

  await stateSetJson(otpKey(phone), { otp, expiresAt: Date.now() + OTP_TTL_MS }, OTP_TTL_MS);
  await clearLoginGuard(OTP_SCOPE, phone);

  try {
    if (isDemo) {
      req.log.info({ phone: `***${phone.slice(-3)}` }, "Play Store demo OTP (no SMS)");
      res.json({ success: true, message: "OTP sent successfully", demo: true });
      return;
    }
    if (!apiKey) {
      if (process.env.NODE_ENV === "production") {
        res.status(503).json({ success: false, message: "SMS service not configured. Please try again later." });
        return;
      }
      req.log.warn({ phone: `***${phone.slice(-3)}` }, "FAST2SMS_API_KEY not set — OTP stored server-side only");
      res.json({ success: true, message: "OTP sent successfully" });
      return;
    }
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&sender_id=${senderId}&message=${messageId}&variables_values=${otp}&route=dlt&numbers=${phone}`;
    const response = await fetch(url);
    const data = (await response.json()) as { return?: boolean; message?: string[] };

    req.log.info({ phone: `***${phone.slice(-3)}`, success: data.return }, "OTP send result");

    if (!response.ok || !data.return) {
      req.log.warn({ data, status: response.status }, "Fast2SMS returned failure");
      res.status(502).json({ success: false, message: "Could not send OTP SMS. Please try again." });
      return;
    }
    res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    req.log.error({ err }, "OTP send error");
    res.status(502).json({ success: false, message: "Could not send OTP. Please try again." });
  }
});

router.post("/verify", async (req: Request, res: Response) => {
  const body = req.body as { phone?: string; otp?: string; verifyOnly?: boolean };
  const phone = body.phone ? normalizePhone10(body.phone) : null;
  const otp = String(body.otp ?? "").trim();
  const verifyOnly = body.verifyOnly === true;

  if (!phone || !otp || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ success: false, message: "Phone and 6-digit OTP required" });
    return;
  }

  const isDemo = isPlayStoreDemoPhone(phone);

  const ip = clientIp(req);
  if (!isDemo && isRateLimited(`otp-verify:ip:${ip}`, 40, 15 * 60 * 1000)) {
    res.status(429).json({ success: false, message: "Too many verification attempts. Please wait." });
    return;
  }

  const guard = await readLoginGuard(OTP_SCOPE, phone);
  const locked = activeLockExpiry(guard);
  if (!isDemo && locked) {
    lockResponse(res, locked);
    return;
  }

  if (isDemo) {
    if (!playStoreDemoOtpMatches(otp)) {
      res.status(400).json({ success: false, message: "Incorrect OTP. Use the Play Store test OTP from app access notes." });
      return;
    }
    await stateDelete(otpKey(phone));
    await clearLoginGuard(OTP_SCOPE, phone);
  } else {
    const entry = await stateGetJson<OtpRecord>(otpKey(phone));

    if (!entry) {
      res.status(400).json({ success: false, message: "OTP expired or not found. Please request a new one." });
      return;
    }

    if (Date.now() > entry.expiresAt) {
      await stateDelete(otpKey(phone));
      res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
      return;
    }

    if (!secretMatches(entry.otp, otp)) {
      const fail = await registerLoginFailure(OTP_SCOPE, phone, OTP_TTL_MS);
      if (fail.locked) {
        await stateDelete(otpKey(phone));
        res.status(429).json({
          success: false,
          locked: true,
          retryAfterSeconds: fail.retryAfterSeconds,
          message: `Too many wrong OTP attempts. Locked for ${Math.ceil(fail.retryAfterSeconds / 60)} minutes. Request a new OTP after that.`,
        });
        return;
      }
      res.status(400).json({
        success: false,
        attemptsRemaining: fail.attemptsRemaining,
        message:
          fail.attemptsRemaining === 1
            ? "Incorrect OTP. One attempt left before a 15-minute lock."
            : "Incorrect OTP. Please try again.",
      });
      return;
    }

    await stateDelete(otpKey(phone));
    await clearLoginGuard(OTP_SCOPE, phone);
  }

  if (verifyOnly) {
    res.json({ success: true, message: "OTP verified" });
    return;
  }

  try {
    const { ensureNotificationPrefsColumn } = await import("../lib/notificationPrefs");
    await ensureNotificationPrefsColumn();
    const fullPhone = `+91${phone}`;
    const existing = await query(
      "SELECT id, name, about, avatar_url, two_step_pin, deleted_at FROM users WHERE phone = $1",
      [fullPhone],
    );
    let dbUser: {
      id: number;
      name?: string;
      about?: string;
      avatar_url?: string;
      two_step_pin?: string | null;
      is_new?: boolean;
    };
    if (existing.rows.length > 0) {
      if (existing.rows[0].deleted_at) {
        res.status(403).json({
          success: false,
          message: "This account was deleted. Register again with this number to create a new account.",
        });
        return;
      }
      await query("UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = $1", [existing.rows[0].id]);
      dbUser = existing.rows[0];
    } else {
      const result = await query(
        "INSERT INTO users (phone, is_online, last_seen) VALUES ($1, TRUE, NOW()) RETURNING id",
        [fullPhone],
      );
      dbUser = { ...result.rows[0], is_new: true };
    }
    const twoStepRequired = existing.rows.length > 0 && !!existing.rows[0].two_step_pin;
    await suspendDeveloperApiForConsumerAppLogin(phone);
    res.json({
      success: true,
      message: "OTP verified",
      dbId: dbUser.id,
      sessionToken: issueSessionToken(dbUser.id),
      isNew: !existing.rows.length,
      twoStepRequired,
      name: dbUser.name ?? null,
      about: dbUser.about ?? null,
      avatarUrl: dbUser.avatar_url ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "OTP verify database error");
    res.status(500).json({ success: false, message: "Could not complete login. Please try again." });
  }
});

export default router;
