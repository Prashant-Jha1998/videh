import { matchChatByName, suggestChatNames, type ContactMatchContext } from "./assistantContactMatch";
import type { AssistantLangCode } from "./assistantLanguages";
import { firstName } from "./assistantLanguages";
import type { AssistantUserContext, ExecuteResult } from "./assistantExecutor";
import { query } from "./db";
import { publishChatEvent } from "./realtime";
import { parseScheduleDateTime, stripScheduleTimePhrases, textLooksLikeScheduleTime } from "./assistantScheduleParse";

export type AssistantPendingAction = {
  type: "schedule_message" | "send_message";
  contactName?: string;
  chatId?: number;
  messageText?: string;
  scheduledAt?: string;
};

function isEn(_lang: AssistantLangCode): boolean {
  return true;
}

async function sendChatMessage(userId: number, chatId: number, text: string): Promise<void> {
  const ins = await query(
    `INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1, $2, $3, 'text') RETURNING id`,
    [chatId, userId, text],
  );
  const messageId = Number(ins.rows[0].id);
  const members = await query(
    `SELECT user_id FROM chat_members WHERE chat_id = $1 AND user_id != $2`,
    [chatId, userId],
  );
  const recipientIds = members.rows.map((r: { user_id: number }) => Number(r.user_id)).filter(Boolean);
  if (recipientIds.length > 0) {
    await query(
      `INSERT INTO message_status (message_id, user_id, status)
       SELECT $1, unnest($2::int[]), 'delivered'
       ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'delivered', updated_at = NOW()`,
      [messageId, recipientIds],
    );
    publishChatEvent({
      type: "message",
      chatId,
      userIds: [userId, ...recipientIds],
      payload: { messageId },
    });
  }
}

async function insertScheduledMessage(
  userId: number,
  chatId: number,
  content: string,
  scheduledAt: Date,
): Promise<void> {
  await query(
    `INSERT INTO scheduled_messages (chat_id, sender_id, content, type, scheduled_at)
     VALUES ($1, $2, $3, 'text', $4)`,
    [chatId, userId, content, scheduledAt],
  );
}

function askMissing(
  pending: AssistantPendingAction,
  lang: AssistantLangCode,
  userFirst: string,
): string {
  const missing: string[] = [];
  if (!pending.contactName && !pending.chatId) missing.push("contact");
  if (!pending.scheduledAt && pending.type === "schedule_message") missing.push("time");
  if (!pending.messageText?.trim()) missing.push("message");

  if (missing.includes("contact")) {
    return isEn(lang)
      ? `${userFirst}, who should I schedule the message for? Say a contact name.`
      : `${userFirst} ji, kisko message schedule karna hai? Contact ka naam boliye.`;
  }
  if (missing.includes("time")) {
    return isEn(lang)
      ? `${userFirst}, when should I send it? For example: tomorrow 5 PM or today 6 PM.`
      : `${userFirst} ji, kab bhejoon? Jaise kal shaam 5 baje ya aaj 6 baje.`;
  }
  return isEn(lang)
    ? `${userFirst}, what message should I send?`
    : `${userFirst} ji, kya message bhejoon?`;
}

function resolveChat(ctx: ContactMatchContext, pending: AssistantPendingAction) {
  if (pending.chatId) {
    return ctx.chats.find((c) => c.chatId === pending.chatId) ?? null;
  }
  if (pending.contactName) return matchChatByName(ctx, pending.contactName);
  return null;
}

export async function continuePendingAssistantAction(
  ctx: AssistantUserContext,
  pending: AssistantPendingAction,
  userText: string,
  lang: AssistantLangCode,
): Promise<ExecuteResult> {
  const name = firstName(ctx.userName);
  const text = userText.trim();
  const next: AssistantPendingAction = { ...pending };

  if (!next.contactName && !next.chatId) {
    const chat = matchChatByName(ctx, text);
    if (chat) {
      next.contactName = chat.displayName;
      next.chatId = chat.chatId;
    } else {
      const hints = suggestChatNames(ctx, text);
      return {
        intent: pending.type,
        success: false,
        speak: hints.length
          ? `${name}, "${text}" se contact nahi mila. Kya aap ${hints.join(" ya ")} keh rahe hain?`
          : `${name}, contact nahi mila. Naam phir se boliye.`,
        actions: [],
        pendingAction: pending,
      };
    }
  }

  if (pending.type === "schedule_message" && !next.scheduledAt && textLooksLikeScheduleTime(text)) {
    const when = parseScheduleDateTime(text);
    if (when) next.scheduledAt = when.toISOString();
  }

  if (!next.messageText?.trim()) {
    const stripped = stripScheduleTimePhrases(text);
    const usedForContact = !pending.contactName && !pending.chatId && next.contactName;
    const candidate = usedForContact && stripped.length < 3 ? "" : stripped;
    if (candidate.length >= 2 && !textLooksLikeScheduleTime(candidate)) {
      next.messageText = candidate;
    } else if (!next.scheduledAt && text.length >= 2 && !textLooksLikeScheduleTime(text)) {
      next.messageText = text;
    }
  }

  const chat = resolveChat(ctx, next);
  if (!chat && (next.contactName || next.chatId)) {
    return {
      intent: pending.type,
      success: false,
      speak: `${name}, chat nahi mila. Contact ka naam phir se boliye.`,
      actions: [],
      pendingAction: { ...next, chatId: undefined, contactName: undefined },
    };
  }
  if (chat) {
    next.contactName = chat.displayName;
    next.chatId = chat.chatId;
  }

  const needsContact = !next.chatId;
  const needsTime = pending.type === "schedule_message" && !next.scheduledAt;
  const needsMessage = !next.messageText?.trim();

  if (needsContact || needsTime || needsMessage) {
    return {
      intent: pending.type,
      success: false,
      speak: askMissing(next, lang, name),
      actions: [],
      pendingAction: next,
    };
  }

  if (pending.type === "send_message") {
    await sendChatMessage(ctx.userId, next.chatId!, next.messageText!);
    return {
      intent: "send_message",
      success: true,
      speak: `${name} ji, ${next.contactName} ko message bhej diya: ${next.messageText}. Kaam ho gaya.`,
      actions: [{ type: "open_chat", chatId: String(next.chatId), contactName: next.contactName }],
      data: { contact: next.contactName, messageText: next.messageText },
    };
  }

  const when = new Date(next.scheduledAt!);
  await insertScheduledMessage(ctx.userId, next.chatId!, next.messageText!, when);
  const timeLabel = when.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return {
    intent: "schedule_message",
    success: true,
    speak: `${name} ji, ${next.contactName} ko message ${timeLabel} par schedule ho gaya: "${next.messageText}". Kaam ho gaya.`,
    actions: [{ type: "open_chat", chatId: String(next.chatId), contactName: next.contactName }],
    data: { contact: next.contactName, messageText: next.messageText, scheduledAt: next.scheduledAt },
  };
}
