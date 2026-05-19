import { Router } from "express";
import crypto from "node:crypto";
import { query } from "../lib/db";
import { logger } from "../lib/logger";
import { getRazorpayConfig } from "../lib/razorpay";
import { ensureDeveloperPlatformTables } from "../lib/developerPlatform";

const router = Router();

function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = (process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "").trim();
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** POST /api/developer-billing/webhook — Razorpay subscription / invoice events */
router.post("/webhook", async (req, res) => {
  const sig = String(req.headers["x-razorpay-signature"] ?? "");
  const rawBody = (req as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

  if (process.env["RAZORPAY_WEBHOOK_SECRET"] && !verifyWebhookSignature(rawBody, sig)) {
    res.status(400).json({ success: false, message: "Invalid signature" });
    return;
  }

  try {
    await ensureDeveloperPlatformTables();
    const event = req.body as {
      event?: string;
      payload?: {
        payment?: { entity?: { id?: string; status?: string; notes?: Record<string, string> } };
        subscription?: { entity?: { notes?: Record<string, string> } };
      };
    };

    const eventType = event.event ?? "unknown";
    const payment = event.payload?.payment?.entity;
    const notes = payment?.notes ?? event.payload?.subscription?.entity?.notes ?? {};
    const accountId = Number(notes.account_id ?? notes.developer_account_id ?? 0);

    if (accountId && (eventType === "payment.failed" || payment?.status === "failed")) {
      await query(
        `UPDATE developer_api_accounts SET billing_status = 'hold', last_payment_failed_at = NOW() WHERE id = $1`,
        [accountId],
      );
      await query(
        `INSERT INTO developer_billing_events (account_id, event_type, amount_inr, razorpay_payment_id, status, metadata)
         VALUES ($1, 'payment_failed', 0, $2, 'failed', $3)`,
        [accountId, payment?.id ?? null, JSON.stringify({ event: eventType })],
      );
      logger.info({ accountId, eventType }, "developer billing hold from webhook");
    }

    if (accountId && (eventType === "payment.captured" || payment?.status === "captured")) {
      await query(
        `UPDATE developer_api_accounts SET billing_status = 'active', last_payment_at = NOW() WHERE id = $1`,
        [accountId],
      );
      await query(
        `INSERT INTO developer_billing_events (account_id, event_type, amount_inr, razorpay_payment_id, status, metadata)
         VALUES ($1, 'usage_payment', 0, $2, 'captured', $3)`,
        [accountId, payment?.id ?? null, JSON.stringify({ event: eventType })],
      );
    }

    res.json({ success: true, received: eventType });
  } catch (err) {
    logger.error({ err }, "developer billing webhook");
    res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
});

/** GET /api/developer-billing/status — health for Razorpay config */
router.get("/status", (_req, res) => {
  const { configured } = getRazorpayConfig();
  res.json({
    success: true,
    razorpayConfigured: configured,
    webhookSecretConfigured: Boolean(process.env["RAZORPAY_WEBHOOK_SECRET"]),
  });
});

export default router;
