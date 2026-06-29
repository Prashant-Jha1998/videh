import type { PlannedAction } from "./assistantIntents";
import {
  matchBroadcastByName,
  matchChatByName,
  suggestChatNames,
  type BroadcastRef,
  type ChatRef,
  type ContactMatchContext,
} from "./assistantContactMatch";
import type { AssistantLangCode } from "./assistantLanguages";
import { firstName } from "./assistantLanguages";
import type { AssistantPendingAction } from "./assistantPending";
import { parseScheduleDateTime } from "./assistantScheduleParse";
import { query } from "./db";
import { publishChatEvent } from "./realtime";

function isEn(_lang: AssistantLangCode): boolean {
  return true;
}

function doneSuffix(lang: AssistantLangCode): string {
  const map: Partial<Record<AssistantLangCode, string>> = {
    hi: "Kaam ho gaya.",
    en: "Done.",
    ta: "வேலை முடிந்தது.",
    te: "పని పూర్తయింది.",
    bn: "কাজ হয়ে গেছে।",
    mr: "काम झाले.",
    gu: "કામ થઈ ગયું.",
    kn: "ಕೆಲಸ ಮುಗಿದಿದೆ.",
    ml: "ജോലി പൂർത്തിയായി.",
    pa: "ਕੰਮ ਹੋ ਗਿਆ.",
    ur: "کام ہو گیا۔",
  };
  return map[lang] ?? map.en!;
}

export type AssistantUserContext = ContactMatchContext & {
  userId: number;
  userName: string;
  contactNames: string[];
  groupNames: string[];
};

export type ExecuteResult = {
  speak: string;
  intent: string;
  success: boolean;
  actions: Array<{ type: string; chatId?: string; callType?: string; contactName?: string }>;
  data?: unknown;
  pendingAction?: AssistantPendingAction;
};

export async function loadAssistantUserContext(userId: number): Promise<AssistantUserContext> {
  const userRow = await query(`SELECT name FROM users WHERE id = $1`, [userId]);
  const userName = (userRow.rows[0] as { name?: string })?.name?.trim() || "User";

  const direct = await query(
    `SELECT c.id AS chat_id, u.name AS display_name, u.id AS other_user_id, FALSE AS is_group
     FROM chats c
     JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $1
     JOIN chat_members other ON other.chat_id = c.id AND other.user_id != $1
     JOIN users u ON u.id = other.user_id
     WHERE c.is_group = FALSE AND u.name IS NOT NULL
     ORDER BY c.id DESC`,
    [userId],
  );

  const groups = await query(
    `SELECT c.id AS chat_id, c.group_name AS display_name, TRUE AS is_group
     FROM chats c
     JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $1
     WHERE c.is_group = TRUE AND c.group_name IS NOT NULL
     ORDER BY c.id DESC`,
    [userId],
  );

  const chats: ChatRef[] = [
    ...direct.rows.map((r: { chat_id: number; display_name: string; other_user_id: number }) => ({
      chatId: Number(r.chat_id),
      displayName: r.display_name,
      otherUserId: Number(r.other_user_id),
      isGroup: false,
    })),
    ...groups.rows.map((r: { chat_id: number; display_name: string }) => ({
      chatId: Number(r.chat_id),
      displayName: r.display_name,
      otherUserId: 0,
      isGroup: true,
    })),
  ];

  let broadcastLists: BroadcastRef[] = [];
  try {
    const bc = await query(
      `SELECT id, name FROM broadcast_lists WHERE creator_id = $1 ORDER BY name`,
      [userId],
    );
    broadcastLists = bc.rows.map((r: { id: number; name: string }) => ({
      id: Number(r.id),
      name: r.name,
    }));
  } catch { /* table may not exist */ }

  const contactNames = chats.filter((c) => !c.isGroup).map((c) => c.displayName);
  const groupNames = chats.filter((c) => c.isGroup).map((c) => c.displayName);

  return { userId, userName, contactNames, groupNames, chats, broadcastLists };
}

function chatNotFoundSpeak(
  ctx: AssistantUserContext,
  needle: string,
  lang: AssistantLangCode,
  userFirst: string,
): string {
  const hints = suggestChatNames(ctx, needle);
  if (isEn(lang)) {
    return hints.length
      ? `${userFirst}, no exact match for "${needle}". Did you mean: ${hints.join(", ")}?`
      : `${userFirst}, no chat found for "${needle}". Say list contacts to hear your chats.`;
  }
  return hints.length
    ? `${userFirst} ji, "${needle}" ka chat nahi mila. Kya aap inme se kisi ko keh rahe hain: ${hints.join(", ")}?`
    : `${userFirst} ji, "${needle}" ka chat nahi mila. Contacts sunne ke liye bolein: mere contacts kaun hain.`;
}

export async function sendChatMessage(userId: number, chatId: number, text: string): Promise<number> {
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
  return messageId;
}

async function markChatRead(userId: number, chatId: number): Promise<void> {
  await query(
    `UPDATE chat_members SET last_read_at = NOW() WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId],
  );
  await query(
    `INSERT INTO message_status (message_id, user_id, status, updated_at)
     SELECT m.id, $2, 'read', NOW()
     FROM messages m
     WHERE m.chat_id = $1 AND m.sender_id != $2
     ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = NOW()`,
    [chatId, userId],
  );
}

function messagePreview(type: string, content: string): string {
  if (type === "text") return content.slice(0, 100);
  if (type === "audio") return "voice message";
  if (type === "image") return "photo";
  if (type === "video") return "video";
  if (type === "call") return "call";
  return type;
}

export async function executeAssistantAction(
  ctx: AssistantUserContext,
  plan: PlannedAction,
  lang: AssistantLangCode,
): Promise<ExecuteResult> {
  const { userId } = ctx;
  const name = firstName(ctx.userName);
  const suffix = doneSuffix(lang);

  switch (plan.intent) {
    case "send_message": {
      const contactName = plan.contactName ?? "";
      const messageText = plan.messageText ?? "";
      const chat = matchChatByName(ctx, contactName);
      if (!chat) {
        return {
          intent: "send_message",
          success: false,
          speak: chatNotFoundSpeak(ctx, contactName, lang, name),
          actions: [],
        };
      }
      await sendChatMessage(userId, chat.chatId, messageText);
      return {
        intent: "send_message",
        success: true,
        speak: isEn(lang)
          ? `${name}, message sent to ${chat.displayName}: ${messageText}. ${suffix}`
          : `${name} ji, ${chat.displayName} ko message bhej diya: ${messageText}. ${suffix}`,
        actions: [{ type: "open_chat", chatId: String(chat.chatId), contactName: chat.displayName }],
        data: { contact: chat.displayName, messageText },
      };
    }

    case "send_message_prompt": {
      const contactName = plan.contactName ?? "";
      const chat = matchChatByName(ctx, contactName);
      if (!chat) {
        return {
          intent: "send_message_prompt",
          success: false,
          speak: chatNotFoundSpeak(ctx, contactName, lang, name),
          actions: [],
        };
      }
      return {
        intent: "send_message_prompt",
        success: false,
        speak: isEn(lang)
          ? `${name}, what message should I send to ${chat.displayName}?`
          : `${name} ji, ${chat.displayName} ko kya message bhejoon?`,
        actions: [],
        pendingAction: {
          type: "send_message",
          contactName: chat.displayName,
          chatId: chat.chatId,
        },
      };
    }

    case "schedule_message": {
      const contactName = plan.contactName ?? "";
      const messageText = plan.messageText ?? "";
      const scheduledAtText = plan.scheduledAtText ?? "";
      const chat = contactName ? matchChatByName(ctx, contactName) : null;
      const when = scheduledAtText ? parseScheduleDateTime(scheduledAtText) : null;

      const pending: AssistantPendingAction = {
        type: "schedule_message",
        contactName: chat?.displayName ?? (contactName || undefined),
        chatId: chat?.chatId,
        messageText: messageText || undefined,
        scheduledAt: when?.toISOString(),
      };

      if (!pending.chatId && contactName) {
        return {
          intent: "schedule_message",
          success: false,
          speak: chatNotFoundSpeak(ctx, contactName, lang, name),
          actions: [],
          pendingAction: { type: "schedule_message" },
        };
      }
      if (!pending.chatId) {
        return {
          intent: "schedule_message",
          success: false,
          speak: isEn(lang)
            ? `${name}, who should I schedule the message for?`
            : `${name} ji, kisko message schedule karna hai?`,
          actions: [],
          pendingAction: pending,
        };
      }
      if (!pending.scheduledAt) {
        return {
          intent: "schedule_message",
          success: false,
          speak: isEn(lang)
            ? `${name}, when should I send it to ${pending.contactName}? Say for example tomorrow 5 PM.`
            : `${name} ji, ${pending.contactName} ko kab bhejoon? Jaise kal shaam 5 baje.`,
          actions: [],
          pendingAction: pending,
        };
      }
      if (!pending.messageText?.trim()) {
        return {
          intent: "schedule_message",
          success: false,
          speak: isEn(lang)
            ? `${name}, what message should I schedule for ${pending.contactName}?`
            : `${name} ji, ${pending.contactName} ko kya message schedule karoon?`,
          actions: [],
          pendingAction: pending,
        };
      }

      await query(
        `INSERT INTO scheduled_messages (chat_id, sender_id, content, type, scheduled_at)
         VALUES ($1, $2, $3, 'text', $4)`,
        [pending.chatId, userId, pending.messageText, new Date(pending.scheduledAt)],
      );
      const timeLabel = new Date(pending.scheduledAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      });
      return {
        intent: "schedule_message",
        success: true,
        speak: isEn(lang)
          ? `${name}, message to ${pending.contactName} scheduled for ${timeLabel}: "${pending.messageText}". ${suffix}`
          : `${name} ji, ${pending.contactName} ko ${timeLabel} par message schedule ho gaya: "${pending.messageText}". ${suffix}`,
        actions: [{ type: "open_chat", chatId: String(pending.chatId), contactName: pending.contactName }],
        data: { contact: pending.contactName, messageText: pending.messageText, scheduledAt: pending.scheduledAt },
      };
    }

    case "call_contact": {
      const chat = matchChatByName(ctx, plan.contactName ?? "");
      if (!chat || chat.isGroup) {
        return {
          intent: "call_contact",
          success: false,
          speak: chat
            ? `${name}, group calls are not available via the assistant yet. Start one from the app.`
            : chatNotFoundSpeak(ctx, plan.contactName ?? "", lang, name),
          actions: [],
        };
      }
      const callType = plan.callType === "video" ? "video" : "audio";
      return {
        intent: "call_contact",
        success: true,
        speak: isEn(lang)
          ? `${name}, should I call ${chat.displayName}? The app will ask you to confirm.`
          : `${name} ji, ${chat.displayName} ko call karoon? App mein confirm karenge.`,
        actions: [{
          type: "start_call",
          chatId: String(chat.chatId),
          callType,
          contactName: chat.displayName,
        }],
      };
    }

    case "open_chat": {
      const chat = matchChatByName(ctx, plan.contactName ?? "");
      if (!chat) {
        return {
          intent: "open_chat",
          success: false,
          speak: chatNotFoundSpeak(ctx, plan.contactName ?? "", lang, name),
          actions: [],
        };
      }
      return {
        intent: "open_chat",
        success: true,
        speak: isEn(lang)
          ? `${name}, opening chat with ${chat.displayName}. ${suffix}`
          : `${name} ji, ${chat.displayName} ka chat khol diya. ${suffix}`,
        actions: [{ type: "open_chat", chatId: String(chat.chatId), contactName: chat.displayName }],
      };
    }

    case "mark_read": {
      if (!plan.contactName?.trim()) {
        await query(`UPDATE chat_members SET last_read_at = NOW() WHERE user_id = $1`, [userId]);
        await query(
          `INSERT INTO message_status (message_id, user_id, status, updated_at)
           SELECT m.id, $1, 'read', NOW()
           FROM messages m
           JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
           WHERE m.sender_id != $1
           ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = NOW()`,
          [userId],
        );
        return {
          intent: "mark_all_read",
          success: true,
          speak: isEn(lang) ? `${name}, all chats marked read. ${suffix}` : `${name} ji, sab chats read mark ho gayi. ${suffix}`,
          actions: [],
        };
      }
      const chat = matchChatByName(ctx, plan.contactName);
      if (!chat) {
        return { intent: "mark_read", success: false, speak: chatNotFoundSpeak(ctx, plan.contactName, lang, name), actions: [] };
      }
      await markChatRead(userId, chat.chatId);
      return {
        intent: "mark_read",
        success: true,
        speak: isEn(lang)
          ? `${name}, ${chat.displayName}'s chat marked read. ${suffix}`
          : `${name} ji, ${chat.displayName} ke messages read mark ho gaye. ${suffix}`,
        actions: [{ type: "open_chat", chatId: String(chat.chatId) }],
      };
    }

    case "mark_all_read": {
      await query(`UPDATE chat_members SET last_read_at = NOW() WHERE user_id = $1`, [userId]);
      await query(
        `INSERT INTO message_status (message_id, user_id, status, updated_at)
         SELECT m.id, $1, 'read', NOW()
         FROM messages m
         JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
         WHERE m.sender_id != $1
         ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'read', updated_at = NOW()`,
        [userId],
      );
      return {
        intent: "mark_all_read",
        success: true,
        speak: isEn(lang) ? `${name}, all messages marked read. ${suffix}` : `${name} ji, sab messages read ho gaye. ${suffix}`,
        actions: [],
      };
    }

    case "search_messages": {
      const q = (plan.searchQuery ?? "").trim();
      const r = await query(
        `SELECT COALESCE(u.name, c.group_name) AS from_name, m.content, m.type
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.is_deleted = FALSE AND m.type = 'text' AND m.content ILIKE $2
         ORDER BY m.created_at DESC
         LIMIT 8`,
        [userId, `%${q}%`],
      );
      if (!r.rows.length) {
        return {
          intent: "search_messages",
          success: true,
          speak: isEn(lang) ? `${name}, no messages found for "${q}". ${suffix}` : `${name} ji, "${q}" se koi message nahi mila. ${suffix}`,
          actions: [],
        };
      }
      const lines = r.rows.map((row: { from_name: string; content: string }) =>
        `${row.from_name}: ${row.content.slice(0, 60)}`);
      return {
        intent: "search_messages",
        success: true,
        speak: isEn(lang) ? `${name}, found: ${lines.join(". ")}. ${suffix}` : `${name} ji, mila: ${lines.join(". ")}. ${suffix}`,
        data: { results: r.rows },
        actions: [],
      };
    }

    case "missed_calls": {
      const r = await query(
        `SELECT CASE WHEN c.caller_id = $1 THEN u2.name ELSE u1.name END AS other_name,
                c.type, c.status, c.created_at
         FROM calls c
         JOIN users u1 ON u1.id = c.caller_id
         JOIN users u2 ON u2.id = c.callee_id
         WHERE (c.caller_id = $1 OR c.callee_id = $1)
           AND c.status = 'missed'
           AND c.created_at >= NOW() - INTERVAL '7 days'
         ORDER BY c.created_at DESC
         LIMIT 15`,
        [userId],
      );
      if (!r.rows.length) {
        return {
          intent: "missed_calls",
          success: true,
          speak: isEn(lang)
            ? `${name}, no missed calls in the last week. ${suffix}`
            : `${name} ji, pichle hafte koi missed call nahi. ${suffix}`,
          actions: [{ type: "open_calls_tab" }],
        };
      }
      const lines = r.rows.map((row: { other_name: string; type: string }) =>
        `${row.other_name} (${row.type})`);
      return {
        intent: "missed_calls",
        success: true,
        speak: isEn(lang)
          ? `${name}, missed calls: ${lines.join(", ")}. ${suffix}`
          : `${name} ji, missed calls: ${lines.join(", ")}. ${suffix}`,
        actions: [{ type: "open_calls_tab" }],
        data: { calls: r.rows },
      };
    }

    case "group_message_stats": {
      const r = await query(
        `SELECT c.group_name, COUNT(m.id)::int AS msg_count
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
         WHERE c.is_group = TRUE
           AND m.is_deleted = FALSE
           AND m.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata')
         GROUP BY c.id, c.group_name
         HAVING COUNT(m.id) > 0
         ORDER BY msg_count DESC
         LIMIT 15`,
        [userId],
      );
      if (!r.rows.length) {
        return {
          intent: "group_message_stats",
          success: true,
          speak: isEn(lang)
            ? `${name}, no group messages today. ${suffix}`
            : `${name} ji, aaj kisi group mein message nahi. ${suffix}`,
          actions: [],
        };
      }
      const parts = r.rows.map((row: { group_name: string; msg_count: number }) =>
        `${row.group_name}: ${row.msg_count}`);
      return {
        intent: "group_message_stats",
        success: true,
        speak: isEn(lang)
          ? `${name}, group messages today: ${parts.join(", ")}. ${suffix}`
          : `${name} ji, aaj groups: ${parts.join(", ")}. ${suffix}`,
        data: { groups: r.rows },
        actions: [],
      };
    }

    case "recent_calls": {
      const r = await query(
        `SELECT CASE WHEN c.caller_id = $1 THEN u2.name ELSE u1.name END AS other_name,
                c.type, c.status, c.created_at
         FROM calls c
         JOIN users u1 ON u1.id = c.caller_id
         JOIN users u2 ON u2.id = c.callee_id
         WHERE c.caller_id = $1 OR c.callee_id = $1
         ORDER BY c.created_at DESC
         LIMIT 8`,
        [userId],
      );
      if (!r.rows.length) {
        return {
          intent: "recent_calls",
          success: true,
          speak: isEn(lang) ? `${name}, no recent calls. ${suffix}` : `${name} ji, koi recent call nahi. ${suffix}`,
          actions: [],
        };
      }
      const lines = r.rows.map((row: { other_name: string; type: string; status: string }) =>
        `${row.other_name} ${row.type} ${row.status}`);
      return {
        intent: "recent_calls",
        success: true,
        speak: isEn(lang) ? `${name}, recent calls: ${lines.join(". ")}. ${suffix}` : `${name} ji, recent calls: ${lines.join(". ")}. ${suffix}`,
        actions: [{ type: "open_calls_tab" }],
      };
    }

    case "list_broadcasts": {
      if (!ctx.broadcastLists.length) {
        return {
          intent: "list_broadcasts",
          success: true,
          speak: isEn(lang) ? `${name}, you have no broadcast lists yet. ${suffix}` : `${name} ji, koi broadcast list nahi hai. ${suffix}`,
          actions: [{ type: "open_broadcasts" }],
        };
      }
      const names = ctx.broadcastLists.map((b) => b.name).join(", ");
      return {
        intent: "list_broadcasts",
        success: true,
        speak: isEn(lang) ? `${name}, broadcast lists: ${names}. ${suffix}` : `${name} ji, aapki broadcast lists: ${names}. ${suffix}`,
        actions: [{ type: "open_broadcasts" }],
      };
    }

    case "send_broadcast": {
      const list = matchBroadcastByName(ctx, plan.broadcastListName ?? "");
      const messageText = plan.messageText ?? "";
      if (!list) {
        const names = ctx.broadcastLists.map((b) => b.name).slice(0, 5).join(", ");
        return {
          intent: "send_broadcast",
          success: false,
          speak: names
            ? `${name}, broadcast list not found. Your lists: ${names}.`
            : `${name}, create a broadcast list first.`,
          actions: [{ type: "open_broadcasts" }],
        };
      }
      const recipients = await query(
        `SELECT br.user_id FROM broadcast_recipients br WHERE br.list_id = $1`,
        [list.id],
      );
      let sent = 0;
      for (const row of recipients.rows as Array<{ user_id: number }>) {
        const recipientId = Number(row.user_id);
        const existing = await query(
          `SELECT c.id FROM chats c
           JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
           JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
           WHERE c.is_group = FALSE LIMIT 1`,
          [userId, recipientId],
        );
        let chatId: number;
        if (existing.rows.length) {
          chatId = Number(existing.rows[0].id);
        } else {
          const nc = await query(`INSERT INTO chats (is_group) VALUES (FALSE) RETURNING id`, []);
          chatId = Number(nc.rows[0].id);
          await query(`INSERT INTO chat_members (chat_id, user_id) VALUES ($1,$2),($1,$3)`, [chatId, userId, recipientId]);
        }
        await sendChatMessage(userId, chatId, messageText);
        sent++;
      }
      return {
        intent: "send_broadcast",
        success: sent > 0,
        speak: `${name}, message sent to ${sent} people on broadcast "${list.name}". ${suffix}`,
        actions: [{ type: "open_broadcasts" }],
        data: { listName: list.name, sentCount: sent },
      };
    }

    case "khata_summary": {
      const chat = matchChatByName(ctx, plan.contactName ?? "");
      if (!chat) {
        return { intent: "khata_summary", success: false, speak: chatNotFoundSpeak(ctx, plan.contactName ?? "", lang, name), actions: [] };
      }
      try {
        const r = await query(
          `SELECT debtor_name, amount::text, paid, note
           FROM khata_entries WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [chat.chatId],
        );
        if (!r.rows.length) {
          return {
            intent: "khata_summary",
            success: true,
            speak: `${name}, no khata entries with ${chat.displayName}. ${suffix}`,
            actions: [{ type: "open_khata", chatId: String(chat.chatId) }],
          };
        }
        const pending = r.rows.filter((row: { paid: boolean }) => !row.paid);
        const lines = pending.length
          ? pending.map((row: { debtor_name: string; amount: string }) => `${row.debtor_name}: ${row.amount} pending`)
          : ["all clear"];
        return {
          intent: "khata_summary",
          success: true,
          speak: `${name}, ${chat.displayName}'s khata: ${lines.join(". ")}. ${suffix}`,
          actions: [{ type: "open_khata", chatId: String(chat.chatId) }],
          data: { entries: r.rows },
        };
      } catch {
        return {
          intent: "khata_summary",
          success: false,
          speak: `${name}, khata is not available for this chat yet.`,
          actions: [],
        };
      }
    }

    case "khata_add": {
      const chat = matchChatByName(ctx, plan.contactName ?? "");
      const amount = Number(plan.amount);
      if (!chat) {
        return { intent: "khata_add", success: false, speak: chatNotFoundSpeak(ctx, plan.contactName ?? "", lang, name), actions: [] };
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return { intent: "khata_add", success: false, speak: `${name}, that amount is not valid.`, actions: [] };
      }
      try {
        await query(
          `INSERT INTO khata_entries (chat_id, created_by, debtor_name, debtor_user_id, amount, note)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [chat.chatId, userId, chat.displayName, chat.otherUserId || null, amount, plan.note ?? null],
        );
        return {
          intent: "khata_add",
          success: true,
          speak: `${name}, added ${amount} rupees to ${chat.displayName}'s khata. ${suffix}`,
          actions: [{ type: "open_khata", chatId: String(chat.chatId) }],
        };
      } catch {
        return { intent: "khata_add", success: false, speak: `${name}, could not save the khata entry.`, actions: [] };
      }
    }

    case "last_incoming_message": {
      const r = await query(
        `SELECT
           CASE WHEN c.is_group THEN c.group_name ELSE u.name END AS label,
           m.content,
           m.type,
           m.created_at
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
         JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
         JOIN users u ON u.id = m.sender_id
         WHERE m.sender_id != $1 AND m.is_deleted = FALSE
         ORDER BY m.created_at DESC
         LIMIT 1`,
        [userId],
      );
      if (!r.rows.length) {
        return {
          intent: "last_incoming_message",
          success: true,
          speak: isEn(lang)
            ? `${name}, you have not received any message yet.`
            : `${name} ji, abhi tak kisi ka message nahi aaya.`,
          actions: [],
        };
      }
      const row = r.rows[0] as { label: string; content: string; type: string };
      const preview = messagePreview(row.type ?? "text", row.content ?? "");
      const chat = matchChatByName(ctx, row.label);
      return {
        intent: "last_incoming_message",
        success: true,
        speak: isEn(lang)
          ? `${name}, your last message is from ${row.label}: ${preview}.`
          : `${name} ji, aapka last message ${row.label} se aaya: ${preview}.`,
        actions: chat ? [{ type: "open_chat", chatId: String(chat.chatId) }] : [],
      };
    }

    case "messages_today": {
      const r = await query(
        `SELECT
           CASE WHEN c.is_group THEN c.group_name ELSE u.name END AS label,
           c.is_group,
           COUNT(m.id)::int AS msg_count,
           MAX(m.content) FILTER (WHERE m.type = 'text') AS last_text,
           MAX(m.type) AS last_type
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
         JOIN users u ON u.id = m.sender_id
         WHERE m.sender_id != $1
           AND m.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata')
           AND m.is_deleted = FALSE
         GROUP BY c.id, c.is_group, c.group_name, u.name
         ORDER BY msg_count DESC
         LIMIT 25`,
        [userId],
      );
      if (!r.rows.length) {
        return {
          intent: "messages_today",
          success: true,
          speak: isEn(lang) ? `${name}, no messages today. ${suffix}` : `${name} ji, aaj kisi ka message nahi aaya. ${suffix}`,
          actions: [],
        };
      }
      const parts = r.rows.map((row: {
        label: string;
        is_group: boolean;
        msg_count: number;
        last_text?: string;
        last_type?: string;
      }) => {
        const preview = messagePreview(row.last_type ?? "text", row.last_text ?? "");
        const prefix = row.is_group ? `${row.label} group` : row.label;
        return `${prefix}: ${row.msg_count} message, ${preview}`;
      });
      return {
        intent: "messages_today",
        success: true,
        speak: isEn(lang) ? `${name}, today: ${parts.join(". ")}. ${suffix}` : `${name} ji, aaj: ${parts.join(". ")}. ${suffix}`,
        data: { senders: r.rows },
        actions: [],
      };
    }

    case "messages_from":
    case "last_message_from": {
      const chat = matchChatByName(ctx, plan.contactName ?? "");
      if (!chat) {
        return { intent: plan.intent, success: false, speak: chatNotFoundSpeak(ctx, plan.contactName ?? "", lang, name), actions: [] };
      }
      const limit = plan.intent === "last_message_from" ? 1 : 5;
      const r = await query(
        `SELECT m.content, m.type FROM messages m
         WHERE m.chat_id = $1 AND m.sender_id != $2 AND m.is_deleted = FALSE
         ORDER BY m.created_at DESC LIMIT $3`,
        [chat.chatId, userId, limit],
      );
      if (!r.rows.length) {
        return {
          intent: plan.intent,
          success: true,
          speak: `${name}, no messages from ${chat.displayName} yet. ${suffix}`,
          actions: [],
        };
      }
      const lines = r.rows.map((row: { content: string; type: string }) => messagePreview(row.type, row.content));
      return {
        intent: plan.intent,
        success: true,
        speak: `${name}, ${chat.displayName}: ${lines.join(". ")}. ${suffix}`,
        actions: [{ type: "open_chat", chatId: String(chat.chatId) }],
      };
    }

    case "unread_count": {
      const r = await query(
        `SELECT COUNT(*)::int AS cnt FROM messages m
         JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
         LEFT JOIN message_status ms ON ms.message_id = m.id AND ms.user_id = $1
         WHERE m.sender_id != $1 AND m.is_deleted = FALSE
           AND (ms.status IS NULL OR ms.status != 'read')`,
        [userId],
      );
      const cnt = Number(r.rows[0]?.cnt ?? 0);

      const breakdown = await query(
        `SELECT COALESCE(u.name, c.group_name) AS chat_name,
                COUNT(m.id)::int AS unread
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
         JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
         LEFT JOIN users u ON u.id = m.sender_id AND m.sender_id != $1
         LEFT JOIN message_status ms ON ms.message_id = m.id AND ms.user_id = $1
         WHERE m.sender_id != $1 AND m.is_deleted = FALSE
           AND (ms.status IS NULL OR ms.status != 'read')
         GROUP BY COALESCE(u.name, c.group_name)
         ORDER BY unread DESC
         LIMIT 8`,
        [userId],
      );

      if (!cnt) {
        return {
          intent: "unread_count",
          success: true,
          speak: isEn(lang)
            ? `${name}, you have no unread messages. ${suffix}`
            : `${name} ji, koi unread message nahi hai. ${suffix}`,
          data: { count: 0 },
          actions: [],
        };
      }

      const parts = breakdown.rows.map((row: { chat_name: string; unread: number }) =>
        `${row.chat_name}: ${row.unread}`);
      return {
        intent: "unread_count",
        success: true,
        speak: isEn(lang)
          ? `${name}, ${cnt} unread messages. ${parts.join(", ")}. ${suffix}`
          : `${name} ji, ${cnt} unread messages. ${parts.join(", ")}. ${suffix}`,
        data: { count: cnt, breakdown: breakdown.rows },
        actions: [],
      };
    }

    case "important_messages": {
      const r = await query(
        `SELECT u.name, m.content, m.type FROM messages m
         JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
         JOIN users u ON u.id = m.sender_id
         LEFT JOIN message_status ms ON ms.message_id = m.id AND ms.user_id = $1
         WHERE m.sender_id != $1 AND m.is_deleted = FALSE
           AND (ms.status IS NULL OR ms.status != 'read')
           AND m.created_at >= NOW() - INTERVAL '7 days'
         ORDER BY m.created_at DESC LIMIT 10`,
        [userId],
      );
      if (!r.rows.length) {
        return {
          intent: "important_messages",
          success: true,
          speak: `${name}, no important unread messages. ${suffix}`,
          actions: [],
        };
      }
      const lines = r.rows.map((row: { name: string; content: string; type: string }) =>
        `${row.name}: ${messagePreview(row.type, row.content)}`);
      return {
        intent: "important_messages",
        success: true,
        speak: `${name}, important: ${lines.join(". ")}. ${suffix}`,
        actions: [],
      };
    }

    case "chat_summary": {
      const r = await query(
        `SELECT COALESCE(u.name, c.group_name) AS name,
                COUNT(m.id)::int AS total,
                SUM(CASE WHEN ms.status IS NULL OR ms.status != 'read' THEN 1 ELSE 0 END)::int AS unread
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
         LEFT JOIN users u ON u.id = m.sender_id AND m.sender_id != $1
         LEFT JOIN message_status ms ON ms.message_id = m.id AND ms.user_id = $1
         WHERE m.sender_id != $1 AND m.is_deleted = FALSE
           AND m.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata')
         GROUP BY COALESCE(u.name, c.group_name)
         ORDER BY total DESC LIMIT 15`,
        [userId],
      );
      if (!r.rows.length) {
        return { intent: "chat_summary", success: true, speak: isEn(lang) ? `${name}, no activity today. ${suffix}` : `${name} ji, aaj koi message activity nahi. ${suffix}`, actions: [] };
      }
      const parts = r.rows.map((row: { name: string; total: number; unread: number }) =>
        `${row.name}: ${row.total} msgs, ${row.unread} unread`);
      return {
        intent: "chat_summary",
        success: true,
        speak: isEn(lang)
          ? `${name}, summary: ${parts.join(". ")}. ${suffix}`
          : `${name} ji, aaj ke messages: ${parts.join(". ")}. ${suffix}`,
        actions: [],
      };
    }

    case "list_contacts": {
      const names = ctx.chats.map((c) => c.isGroup ? `${c.displayName} (group)` : c.displayName);
      return {
        intent: "list_contacts",
        success: true,
        speak: isEn(lang)
          ? `${name}, your ${names.length} chats include: ${names.slice(0, 20).join(", ")}${names.length > 20 ? " and more" : ""}. ${suffix}`
          : `${name} ji, aapke ${names.length} chats: ${names.slice(0, 20).join(", ")}${names.length > 20 ? " aur aur" : ""}. ${suffix}`,
        actions: [],
      };
    }

    default:
      return {
        intent: "unknown",
        success: false,
        speak: plan.speak ?? `${name}, I can help with messaging, calls, broadcast, khata, and app settings. Just ask.`,
        actions: [],
      };
  }
}
