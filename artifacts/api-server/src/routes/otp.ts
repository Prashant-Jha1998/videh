import type { Request, Response } from "express";
import { Router } from "express";

const router = Router();

router.post("/send", async (req: Request, res: Response) => {
  const { phone } = req.body as { phone?: string };

  if (!phone || !/^\d{10}$/.test(phone)) {
    res.status(400).json({ success: false, message: "Invalid phone number" });
    return;
  }

  const apiKey = process.env["FAST2SMS_API_KEY"];
  const senderId = process.env["FAST2SMS_SENDER_ID"] ?? "VIDEHE";
  const messageId = process.env["FAST2SMS_MESSAGE_ID"] ?? "209634";
  const dltTemplateId = process.env["DLT_TEMPLATE_ID"] ?? "1007181628875366114";

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&sender_id=${senderId}&message=${messageId}&variables_values=${otp}&route=dlt&numbers=${phone}`;
    const response = await fetch(url);
    const data = (await response.json()) as { return?: boolean; message?: string[] };

    req.log.info({ phone: `***${phone.slice(-3)}`, success: data.return }, "OTP send result");

    if (data.return) {
      res.json({ success: true, message: "OTP sent successfully" });
    } else {
      res.status(500).json({ success: false, message: data.message?.[0] ?? "Failed to send OTP" });
    }
  } catch (err) {
    req.log.error({ err }, "OTP send error");
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
});

export default router;
