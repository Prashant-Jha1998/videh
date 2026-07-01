import { query } from "./db";
import { normalizePhone, type MessageTemplateRow } from "./developerTemplates";
import { EXPO_CHAT_MESSAGE_CATEGORY_ID } from "./expoPush";
import { isValidPushToken, sendChatPush } from "./pushNotify";
import { publishChatEvent } from "./realtime";
import type { SendMessageBody } from "./developerApiSend";
import {
  buildBusinessTemplatePayload,
  businessTemplateMediaUrl,
  isDeliverableTemplate,
  serializeBusinessTemplatePayload,
} from "./businessTemplatePayload";
import { resolveStoredMediaUrlEnv } from "./mediaStorage";
import { chatMessagePushPreview } from "./chatMessagePreview";

export type DeliverResult =
  | { ok: true; chatId: number; messageId: number }
  | { ok: false; code: string; message: string };

/** @deprecated Use buildBusinessTemplatePayload — kept for any external imports. */
export type TemplateDeliveryContent = {
  imageUrl: string | null;
  textContent: string;
};

/** Make /uploads/... URLs load in the mobile app (CDN-aware). */
export function toPublicAssetUrl(url: string | null | undefined): string | null {
  return resolveStoredMediaUrlEnv(url);
}

function toE164(normalized91: string): string {
  const d = normalized91.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  if (d.length === 10) return `+91${d}`;
  return normalized91.startsWith("+") ? normalized91 : `+${d}`;
}

/** Find Videh user by Indian mobile (91… or 10-digit). */
export async function findVidehUserByPhone(normalized91: string): Promise<{
  id: number;
  push_token: string | null;
  name: string | null;
} | null> {
  const digits = normalized91.replace(/\D/g, "");
  const e164 = toE164(digits);
  const r = await query(
    `SELECT id, push_token, name FROM users
     WHERE phone = $1
        OR phone = $2
        OR regexp_replace(phone, '\\D', '', 'g') = $3
     LIMIT 1`,
    [e164, digits, digits],
  );
  const row = r.rows[0] as { id: number; push_token?: string | null; name?: string | null } | undefined;
  if (!row) return null;
  return { id: row.id, push_token: row.push_token ?? null, name: row.name ?? null };
}

export async function ensureBusinessSenderUser(
  channelPhone: string,
  displayName: string | null,
  logoUrl: string | null,
): Promise<number | null> {
  const normalized = normalizePhone(channelPhone);
  if (!normalized) return null;

  const existing = await findVidehUserByPhone(normalized);
  const label = (displayName ?? "").trim() || "Business";
  const avatar = logoUrl != null ? toPublicAssetUrl(logoUrl) : null;
  if (existing) {
    await query(
      `UPDATE users SET
         name = COALESCE(NULLIF($1::text, ''), NULLIF(name, ''), 'Business'),
         avatar_url = CASE
           WHEN $2::text IS NOT NULL AND BTRIM($2::text) <> '' THEN $2::text
           ELSE avatar_url
         END,
         updated_at = NOW()
       WHERE id = $3`,
      [label, avatar, existing.id],
    );
    return existing.id;
  }

  const e164 = toE164(normalized);
  const ins = await query(
    `INSERT INTO users (phone, name, avatar_url, is_online, last_seen)
     VALUES ($1::text, $2::text, $3::text, FALSE, NOW()) RETURNING id`,
    [e164, label, avatar],
  );
  return (ins.rows[0] as { id: number }).id;
}

async function findOrCreateDirectChat(userId: number, otherUserId: number): Promise<number> {
  const existing = await query(
    `SELECT c.id FROM chats c
     JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
     JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
     WHERE c.is_group = FALSE
     LIMIT 1`,
    [userId, otherUserId],
  );
  if (existing.rows.length > 0) return Number(existing.rows[0].id);

  const chat = await query("INSERT INTO chats (is_group) VALUES (FALSE) RETURNING id", []);
  const chatId = Number(chat.rows[0].id);
  await query("INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)", [
    chatId,
    userId,
    otherUserId,
  ]);
  return chatId;
}

async function isDirectChatBlocked(chatId: number, senderId: number): Promise<boolean> {
  const r = await query(
    `SELECT EXISTS(
       SELECT 1
       FROM chats c
       JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $2
       JOIN chat_members other ON other.chat_id = c.id AND other.user_id != $2
       JOIN blocked_users b
         ON (b.blocker_id = me.user_id AND b.blocked_id = other.user_id)
         OR (b.blocker_id = other.user_id AND b.blocked_id = me.user_id)
       WHERE c.id = $1 AND c.is_group = FALSE
     ) AS blocked`,
    [chatId, senderId],
  );
  return !!r.rows[0]?.blocked;
}

/** Deliver template to recipient's Videh inbox from business channel user. */
export async function deliverBusinessMessageToVidehInbox(input: {
  accountId: number;
  channelPhone: string;
  senderDisplayName: string | null;
  businessLogoUrl: string | null;
  recipientPhone: string;
  tmpl: MessageTemplateRow;
  apiBody: SendMessageBody;
  externalId: string;
}): Promise<DeliverResult> {
  const recipient = await findVidehUserByPhone(input.recipientPhone);
  if (!recipient) {
    return {
      ok: false,
      code: "recipient_not_on_videh",
      message:
        "Recipient is not registered on Videh with this phone number. They must install Videh and sign up with the same mobile.",
    };
  }

  const senderId = await ensureBusinessSenderUser(
    input.channelPhone,
    input.senderDisplayName,
    input.businessLogoUrl,
  );
  if (!senderId) {
    return {
      ok: false,
      code: "business_channel_invalid",
      message: "Business channel phone is missing or invalid.",
    };
  }

  if (senderId === recipient.id) {
    return {
      ok: false,
      code: "cannot_message_self",
      message: "Cannot send business API messages to your own channel phone.",
    };
  }

  const chatId = await findOrCreateDirectChat(senderId, recipient.id);
  if (await isDirectChatBlocked(chatId, senderId)) {
    return {
      ok: false,
      code: "recipient_blocked",
      message: "Recipient has blocked this business number.",
    };
  }

  const templatePayload = buildBusinessTemplatePayload(input.tmpl, input.apiBody);
  const content = serializeBusinessTemplatePayload(templatePayload);
  const mediaUrl = businessTemplateMediaUrl(templatePayload);

  const templateCategory = String(input.tmpl.category ?? "utility").toLowerCase();
  if (templateCategory === "marketing") {
    const { isBusinessMarketingStopped } = await import("./businessMarketingPrefs");
    const stopped = await isBusinessMarketingStopped(recipient.id, senderId);
    if (stopped) {
      return {
        ok: false,
        code: "marketing_opt_out",
        message:
          "Recipient has stopped offers and announcements from this business on Videh.",
      };
    }
  }

  if (!isDeliverableTemplate(templatePayload)) {
    return {
      ok: false,
      code: "empty_template_content",
      message:
        "Template has no deliverable content. Add body text or a valid header, and pass variables in template.components.",
    };
  }

  const ins = await query(
    `INSERT INTO messages (chat_id, sender_id, content, type, media_url)
     VALUES ($1, $2, $3, 'template', $4)
     RETURNING id`,
    [chatId, senderId, content, mediaUrl],
  );
  const messageId = Number(ins.rows[0].id);

  const senderRow = await query("SELECT name FROM users WHERE id = $1", [senderId]);
  const senderName = (senderRow.rows[0] as { name?: string })?.name ?? input.senderDisplayName ?? "Business";
  const pushPreview = chatMessagePushPreview("template", content);

  if (isValidPushToken(recipient.push_token)) {
    await sendChatPush(
      recipient.push_token,
      senderName,
      pushPreview,
      {
        chatId: String(chatId),
        messageId: String(messageId),
        senderId: String(senderId),
        senderName,
        messageType: "template",
        type: "message",
        notificationKind: "chat_message",
        businessApi: "true",
        externalId: input.externalId,
      },
      { categoryId: EXPO_CHAT_MESSAGE_CATEGORY_ID, threadId: `chat-${chatId}` },
    );
  }

  publishChatEvent({
    type: "message",
    chatId,
    userIds: [senderId, recipient.id],
    payload: {
      messageId,
      content,
      type: "template",
      mediaUrl: mediaUrl ?? undefined,
      senderId,
      senderName,
      businessApi: true,
    },
  });

  await query(
    `UPDATE developer_api_accounts SET messages_sent_total = messages_sent_total + 1,
       messages_sent_month = messages_sent_month + 1 WHERE id = $1`,
    [input.accountId],
  ).catch(() => null);

  return { ok: true, chatId, messageId };
}
