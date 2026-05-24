import { Router } from "express";
import crypto from "node:crypto";
import { query } from "../lib/db";
import { logger } from "../lib/logger";
import { requireDeveloperApi } from "../lib/developerApiAuth";
import { assertApiBillingActive } from "../lib/developerBilling";
import { channelPublicFromRow, ensureDeveloperChannelColumns } from "../lib/developerChannel";
import { sendBusinessMessage } from "../lib/developerApiSend";
import {
  ensureDeveloperTemplateTables,
  templateToPublic,
  type MessageTemplateRow,
} from "../lib/developerTemplates";

const router = Router();

router.use(requireDeveloperApi);

/** GET /v1/me — Videh Business API credentials overview */
router.get("/me", async (req, res) => {
  try {
    await ensureDeveloperChannelColumns();
    const account = req.developerAccount!;
    const r = await query(
      `SELECT a.*, l.email, l.status AS lead_status
       FROM developer_api_accounts a
       JOIN developer_leads l ON l.id = a.lead_id
       WHERE a.id = $1`,
      [account.id],
    );
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ success: false, error: { code: "not_found", message: "Account not found" } });
      return;
    }
    res.json({
      success: true,
      data: {
        api_key_id: row.api_key_id,
        reference_code: row.reference_code,
        company_name: row.company_name,
        display_name: row.display_name,
        billing_status: row.billing_status,
        lead_status: row.lead_status,
        channel: channelPublicFromRow(row),
        endpoints: {
          templates: "/v1/templates",
          send_message: `/v1/${row.videh_phone_number_id ?? "{phone-number-id}"}/messages`,
          send_message_alt: "/v1/business-messages",
          webhook_settings: "/v1/settings/webhook",
        },
      },
    });
  } catch (err) {
    logger.error({ err }, "v1 me");
    res.status(500).json({ success: false, error: { code: "server_error", message: "Could not load account" } });
  }
});

router.get("/templates", async (req, res) => {
  try {
    await ensureDeveloperTemplateTables();
    const account = req.developerAccount!;
    const billing = await assertApiBillingActive(account.id);
    if (!billing.ok) {
      res.status(402).json({ success: false, error: { code: billing.reason, message: "API access restricted." } });
      return;
    }
    const r = await query(
      `SELECT * FROM developer_message_templates WHERE account_id = $1 AND status = 'approved' ORDER BY template_key ASC`,
      [account.id],
    );
    res.json({ success: true, data: (r.rows as MessageTemplateRow[]).map(templateToPublic) });
  } catch (err) {
    logger.error({ err }, "v1 templates list");
    res.status(500).json({ success: false, error: { code: "server_error", message: "Could not load templates" } });
  }
});

router.get("/templates/:idOrKey", async (req, res) => {
  try {
    await ensureDeveloperTemplateTables();
    const account = req.developerAccount!;
    const billing = await assertApiBillingActive(account.id);
    if (!billing.ok) {
      res.status(402).json({ success: false, error: { code: billing.reason, message: "API access restricted." } });
      return;
    }
    const isNumeric = /^\d+$/.test(req.params.idOrKey);
    const r = await query(
      isNumeric
        ? `SELECT * FROM developer_message_templates WHERE account_id = $1 AND id = $2 AND status = 'approved'`
        : `SELECT * FROM developer_message_templates WHERE account_id = $1 AND template_key = $2 AND status = 'approved'`,
      isNumeric ? [account.id, Number(req.params.idOrKey)] : [account.id, req.params.idOrKey],
    );
    if (!r.rows[0]) {
      res.status(404).json({ success: false, error: { code: "template_not_found", message: "Not found" } });
      return;
    }
    res.json({ success: true, data: templateToPublic(r.rows[0] as MessageTemplateRow) });
  } catch (err) {
    logger.error({ err }, "v1 template get");
    res.status(500).json({ success: false, error: { code: "server_error", message: "Could not load template" } });
  }
});

/** POST /v1/settings/webhook — register delivery webhook (Videh Business API) */
router.post("/settings/webhook", async (req, res) => {
  try {
    await ensureDeveloperChannelColumns();
    const account = req.developerAccount!;
    const body = req.body as { url?: string; verify_token?: string };
    const url = String(body.url ?? "").trim();
    if (!url || !url.startsWith("https://")) {
      res.status(400).json({ success: false, error: { code: "invalid_url", message: "HTTPS webhook URL required" } });
      return;
    }
    const verifyToken = body.verify_token?.trim() || `vwh_${crypto.randomBytes(12).toString("hex")}`;
    const secret = `vws_${crypto.randomBytes(24).toString("hex")}`;
    await query(
      `UPDATE developer_api_accounts SET webhook_url = $1, webhook_verify_token = $2, webhook_secret = $3 WHERE id = $4`,
      [url, verifyToken, secret, account.id],
    );
    res.json({
      success: true,
      data: {
        webhook_url: url,
        verify_token: verifyToken,
        webhook_secret: secret,
        note: "Subscribe to message.status and message.inbound events. Verify token is sent on GET challenge.",
      },
    });
  } catch (err) {
    logger.error({ err }, "v1 webhook settings");
    res.status(500).json({ success: false, error: { code: "server_error", message: "Could not save webhook" } });
  }
});

router.get("/settings/webhook", async (req, res) => {
  const account = req.developerAccount!;
  const r = await query(
    `SELECT webhook_url, webhook_verify_token FROM developer_api_accounts WHERE id = $1`,
    [account.id],
  );
  const row = r.rows[0] as { webhook_url?: string; webhook_verify_token?: string };
  res.json({
    success: true,
    data: { webhook_url: row?.webhook_url ?? null, verify_token: row?.webhook_verify_token ?? null },
  });
});

/** POST /v1/business-messages */
router.post("/business-messages", async (req, res) => {
  try {
    const account = req.developerAccount!;
    const result = await sendBusinessMessage(account.id, undefined, req.body);
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error({ err }, "v1 business-messages");
    res.status(500).json({ success: false, error: { code: "server_error", message: "Could not send message" } });
  }
});

/** POST /v1/:phoneNumberId/messages — Videh Business API compatible path */
router.post("/:phoneNumberId/messages", async (req, res) => {
  try {
    const account = req.developerAccount!;
    const result = await sendBusinessMessage(account.id, req.params.phoneNumberId, req.body);
    res.status(result.status).json(result.body);
  } catch (err) {
    logger.error({ err }, "v1 phone messages");
    res.status(500).json({ success: false, error: { code: "server_error", message: "Could not send message" } });
  }
});

export default router;
