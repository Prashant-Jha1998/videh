import { Router } from "express";
import crypto from "node:crypto";
import { query } from "../lib/db";
import { logger } from "../lib/logger";
import { requireDeveloperApi } from "../lib/developerApiAuth";
import { assertApiBillingActive, billConversation, type ConversationCategory } from "../lib/developerBilling";
import {
  ensureDeveloperTemplateTables,
  normalizePhone,
  templateToPublic,
  type MessageTemplateRow,
} from "../lib/developerTemplates";

const router = Router();

router.use(requireDeveloperApi);

async function loadApprovedTemplate(
  accountId: number,
  idOrKey: string,
): Promise<MessageTemplateRow | null> {
  const isNumeric = /^\d+$/.test(idOrKey);
  const r = await query(
    isNumeric
      ? `SELECT * FROM developer_message_templates
         WHERE account_id = $1 AND id = $2 AND status = 'approved'`
      : `SELECT * FROM developer_message_templates
         WHERE account_id = $1 AND template_key = $2 AND status = 'approved'`,
    isNumeric ? [accountId, Number(idOrKey)] : [accountId, idOrKey],
  );
  return (r.rows[0] as MessageTemplateRow) ?? null;
}

/** GET /v1/templates — list approved templates for API integration */
router.get("/templates", async (req, res) => {
  try {
    await ensureDeveloperTemplateTables();
    const account = req.developerAccount!;
    const billing = await assertApiBillingActive(account.id);
    if (!billing.ok) {
      res.status(402).json({
        success: false,
        error: { code: billing.reason, message: "API access restricted. Verify payment or contact Videh support." },
      });
      return;
    }

    const r = await query(
      `SELECT * FROM developer_message_templates
       WHERE account_id = $1 AND status = 'approved'
       ORDER BY template_key ASC`,
      [account.id],
    );
    res.json({
      success: true,
      data: (r.rows as MessageTemplateRow[]).map(templateToPublic),
    });
  } catch (err) {
    logger.error({ err }, "v1 templates list");
    res.status(500).json({ success: false, error: { code: "server_error", message: "Could not load templates" } });
  }
});

/** GET /v1/templates/:idOrKey */
router.get("/templates/:idOrKey", async (req, res) => {
  try {
    await ensureDeveloperTemplateTables();
    const account = req.developerAccount!;
    const billing = await assertApiBillingActive(account.id);
    if (!billing.ok) {
      res.status(402).json({
        success: false,
        error: { code: billing.reason, message: "API access restricted." },
      });
      return;
    }

    const row = await loadApprovedTemplate(account.id, req.params.idOrKey);
    if (!row) {
      res.status(404).json({
        success: false,
        error: { code: "template_not_found", message: "Template not found or not approved" },
      });
      return;
    }
    res.json({ success: true, data: templateToPublic(row) });
  } catch (err) {
    logger.error({ err }, "v1 template get");
    res.status(500).json({ success: false, error: { code: "server_error", message: "Could not load template" } });
  }
});

type SendBody = {
  to?: string;
  template?: {
    name?: string;
    language?: { code?: string };
    components?: unknown[];
  };
};

/** POST /v1/business-messages — send using an approved template */
router.post("/business-messages", async (req, res) => {
  try {
    await ensureDeveloperTemplateTables();
    const account = req.developerAccount!;
    const billing = await assertApiBillingActive(account.id);
    if (!billing.ok) {
      res.status(402).json({
        success: false,
        error: { code: billing.reason, message: "API access restricted. Verify payment or contact Videh support." },
      });
      return;
    }

    const body = req.body as SendBody;
    const toRaw = String(body.to ?? "").trim();
    const templateName = String(body.template?.name ?? "").trim();
    const langCode = String(body.template?.language?.code ?? "en").trim() || "en";

    if (!toRaw || !templateName) {
      res.status(400).json({
        success: false,
        error: { code: "invalid_request", message: "Fields `to` and `template.name` are required" },
      });
      return;
    }

    const phone = normalizePhone(toRaw);
    if (!phone) {
      res.status(400).json({
        success: false,
        error: { code: "invalid_phone", message: "Invalid recipient phone. Use 10-digit Indian mobile or 91XXXXXXXXXX" },
      });
      return;
    }

    const tmpl = await loadApprovedTemplate(account.id, templateName);
    if (!tmpl) {
      res.status(400).json({
        success: false,
        error: {
          code: "template_not_approved",
          message: `Template "${templateName}" is not approved. List templates via GET /v1/templates`,
        },
      });
      return;
    }

    if (tmpl.language !== langCode) {
      res.status(400).json({
        success: false,
        error: {
          code: "language_mismatch",
          message: `Template language is "${tmpl.language}", requested "${langCode}"`,
        },
      });
      return;
    }

    const category = (tmpl.category as ConversationCategory) || "utility";
    const bill = await billConversation({
      accountId: account.id,
      initiator: "business",
      category,
      withinServiceWindow: false,
    });

    const externalId = `vmsg_${crypto.randomBytes(12).toString("hex")}`;
    const amountPaise = Math.round(bill.amountInr * 100);

    await query(
      `INSERT INTO developer_api_messages
       (account_id, template_id, external_id, recipient_phone, template_key, language, payload_json, status, billing_amount_inr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8)`,
      [
        account.id,
        tmpl.id,
        externalId,
        phone,
        tmpl.template_key,
        langCode,
        JSON.stringify(body),
        amountPaise,
      ],
    );

    res.status(202).json({
      success: true,
      data: {
        id: externalId,
        status: "queued",
        to: phone,
        template: { name: tmpl.template_key, language: { code: langCode } },
        billing: {
          charged: bill.charged,
          amount_inr: bill.amountInr,
          reason: bill.reason,
        },
      },
    });
  } catch (err) {
    logger.error({ err }, "v1 business-messages send");
    res.status(500).json({ success: false, error: { code: "server_error", message: "Could not send message" } });
  }
});

export default router;
