import crypto from "node:crypto";
import { query } from "./db";
import { assertApiBillingActive, billConversation, type ConversationCategory } from "./developerBilling";
import { assertChannelVerifiedForAccount } from "./developerChannel";
import { ensureDeveloperTemplateTables, normalizePhone, type MessageTemplateRow } from "./developerTemplates";

export type SendMessageBody = {
  to?: string;
  template?: {
    name?: string;
    language?: { code?: string };
    components?: unknown[];
  };
};

export type SendMessageResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

async function loadApprovedTemplate(accountId: number, idOrKey: string): Promise<MessageTemplateRow | null> {
  const isNumeric = /^\d+$/.test(idOrKey);
  const r = await query(
    isNumeric
      ? `SELECT * FROM developer_message_templates WHERE account_id = $1 AND id = $2 AND status = 'approved'`
      : `SELECT * FROM developer_message_templates WHERE account_id = $1 AND template_key = $2 AND status = 'approved'`,
    isNumeric ? [accountId, Number(idOrKey)] : [accountId, idOrKey],
  );
  return (r.rows[0] as MessageTemplateRow) ?? null;
}

export async function sendBusinessMessage(
  accountId: number,
  phoneNumberIdFromPath: string | undefined,
  body: SendMessageBody,
): Promise<SendMessageResult> {
  await ensureDeveloperTemplateTables();

  const acct = await query(
    `SELECT videh_phone_number_id, channel_status, display_name FROM developer_api_accounts WHERE id = $1`,
    [accountId],
  );
  const accountRow = acct.rows[0] as { videh_phone_number_id?: string; channel_status?: string; display_name?: string };
  if (!accountRow) {
    return { ok: false, status: 404, body: { success: false, error: { code: "account_not_found", message: "Account not found" } } };
  }

  if (phoneNumberIdFromPath && accountRow.videh_phone_number_id !== phoneNumberIdFromPath) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: {
          code: "phone_number_id_mismatch",
          message: `URL phone_number_id does not match your registered ID (${accountRow.videh_phone_number_id})`,
        },
      },
    };
  }

  const channel = await assertChannelVerifiedForAccount(accountId);
  if (!channel.ok) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: { code: channel.reason, message: "Business channel not verified. Complete phone OTP in the developer console." },
      },
    };
  }

  const billing = await assertApiBillingActive(accountId);
  if (!billing.ok) {
    return {
      ok: false,
      status: 402,
      body: { success: false, error: { code: billing.reason, message: "API access restricted." } },
    };
  }

  const toRaw = String(body.to ?? "").trim();
  const templateName = String(body.template?.name ?? "").trim();
  const langCode = String(body.template?.language?.code ?? "en").trim() || "en";

  if (!toRaw || !templateName) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: { code: "invalid_request", message: "Fields `to` and `template.name` are required" } },
    };
  }

  const phone = normalizePhone(toRaw);
  if (!phone) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: { code: "invalid_phone", message: "Invalid recipient phone" } },
    };
  }

  const tmpl = await loadApprovedTemplate(accountId, templateName);
  if (!tmpl) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: { code: "template_not_approved", message: `Template "${templateName}" is not approved` },
      },
    };
  }

  if (tmpl.language !== langCode) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: { code: "language_mismatch", message: `Template language is "${tmpl.language}"` } },
    };
  }

  const category = (tmpl.category as ConversationCategory) || "utility";
  const bill = await billConversation({ accountId, initiator: "business", category, withinServiceWindow: false });

  const externalId = `vmsg_${crypto.randomBytes(12).toString("hex")}`;
  const amountPaise = Math.round(bill.amountInr * 100);

  await query(
    `INSERT INTO developer_api_messages
     (account_id, template_id, external_id, recipient_phone, template_key, language, payload_json, status, billing_amount_inr)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8)`,
    [accountId, tmpl.id, externalId, phone, tmpl.template_key, langCode, JSON.stringify(body), amountPaise],
  );

  await query(
    `INSERT INTO developer_webhook_events (account_id, event_type, payload_json, delivery_status)
     VALUES ($1, 'message.queued', $2, 'pending')`,
    [
      accountId,
      JSON.stringify({
        id: externalId,
        phone_number_id: accountRow.videh_phone_number_id,
        to: phone,
        template: templateName,
        status: "queued",
      }),
    ],
  ).catch(() => null);

  return {
    ok: true,
    status: 202,
    body: {
      success: true,
      data: {
        id: externalId,
        messaging_product: "videh",
        phone_number_id: accountRow.videh_phone_number_id,
        status: "queued",
        to: phone,
        template: { name: tmpl.template_key, language: { code: langCode } },
        billing: { charged: bill.charged, amount_inr: bill.amountInr, reason: bill.reason },
      },
    },
  };
}
