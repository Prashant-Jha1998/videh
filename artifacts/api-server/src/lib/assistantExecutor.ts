import { query } from "./db";
import { publishChatEvent } from "./realtime";
import type { PlannedAction } from "./assistantIntents";

export type AssistantUserContext = {
  userId: number;
  userName: string;
  contactNames: string[];
  groupNames: string[];
};

export type ExecuteResult = {
  speak: string;
  intent: string;
  actions: Array<{ type: string; chatId?: string }>;
  data?: unknown;
};

export async function loadAssistantUserContext(userId: number): Promise<AssistantUserContext> {
  const userRow = await query(`SELECT name FROM users WHERE id = $1`, [userId]);
  const userName = (userRow.rows[0] as { name?: string })?.name?.trim() || "User";

  const direct = await query(
    `SELECT DISTINCT u.name
     FROM chats c
     JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $1
     JOIN chat_members other ON other.chat_id = c.id AND other.user_id != $1
     JOIN users u ON u.id = other.user_id
     WHERE c.is_group = FALSE AND u.name IS NOT NULL`,
    [userId],
  );
  const groups = await query(
    `SELECT DISTINCT c.group_name AS name
     FROM chats c
     JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $1
     WHERE c.is_group = TRUE AND c.group_name IS NOT NULL`,
    [userId],
  );

  return {
    userId,
    userName,
    contactNames: direct.rows.map((r: { name: string }) => r.name).filter(Boolean),
    groupNames: groups.rows.map((r: { name: string }) => r.name).filter(Boolean),
  };
}

async function findChat(
  userId: number,
  contactName: string,
): Promise<{ chatId: number; otherUserId: number; displayName: string; isGroup: boolean } | null> {
  const needle = contactName.trim().toLowerCase();
  if (!needle) return null;

  const direct = await query(
    `SELECT c.id AS chat_id, u.id AS other_user_id, u.name AS display_name, FALSE AS is_group
     FROM chats c
     JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $1
     JOIN chat_members other ON other.chat_id = c.id AND other.user_id != $1
     JOIN users u ON u.id = other.user_id
     WHERE c.is_group = FALSE
     ORDER BY c.id DESC`,
    [userId],
  );
  for (const row of direct.rows as Array<{ chat_id: number; other_user_id: number; display_name: string }>) {
    const name = (row.display_name ?? "").toLowerCase();
    if (name.includes(needle) || needle.includes(name.split(" ")[0] ?? "")) {
      return {
        chatId: Number(row.chat_id),
        otherUserId: Number(row.other_user_id),
        displayName: row.display_name,
        isGroup: false,
      };
    }
  }

  const groups = await query(
    `SELECT c.id AS chat_id, c.group_name AS display_name, TRUE AS is_group
     FROM chats c
     JOIN chat_members me ON me.chat_id = c.id AND me.user_id = $1
     WHERE c.is_group = TRUE AND c.group_name IS NOT NULL`,
    [userId],
  );
  for (const row of groups.rows as Array<{ chat_id: number; display_name: string }>) {
    const name = (row.display_name ?? "").toLowerCase();
    if (name.includes(needle) || needle.includes(name.split(" ")[0] ?? "")) {
      return {
        chatId: Number(row.chat_id),
        otherUserId: 0,
        displayName: row.display_name,
        isGroup: true,
      };
    }
  }
  return null;
}

async function sendChatMessage(
  userId: number,
  chatId: number,
  otherUserId: number,
  text: string,
): Promise<number> {
  const ins = await query(
    `INSERT INTO messages (chat_id, sender_id, content, type) VALUES ($1, $2, $3, 'text') RETURNING id`,
    [chatId, userId, text],
  );
  const messageId = Number(ins.rows[0].id);
  if (otherUserId) {
    await query(
      `INSERT INTO message_status (message_id, user_id, status)
       VALUES ($1, $2, 'delivered')
       ON CONFLICT (message_id, user_id) DO UPDATE SET status = 'delivered', updated_at = NOW()`,
      [messageId, otherUserId],
    );
    publishChatEvent({
      type: "message",
      chatId,
      userIds: [userId, otherUserId],
      payload: { messageId },
    });
  }
  return messageId;
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
  locale: "hi" | "en",
): Promise<ExecuteResult> {
  const { userId } = ctx;

  switch (plan.intent) {
    case "send_message": {
      const contactName = plan.contactName ?? "";
      const messageText = plan.messageText ?? "";
      const chat = await findChat(userId, contactName);
      if (!chat) {
        return {
          intent: "send_message",
          speak: locale === "hi"
            ? `${contactName} naam ka chat nahi mila. Pehle unse chat karein ya naam sahi boliye.`
            : `Could not find a chat with ${contactName}.`,
          actions: [],
        };
      }
      await sendChatMessage(userId, chat.chatId, chat.otherUserId, messageText);
      return {
        intent: "send_message",
        speak: locale === "hi"
          ? `Ho gaya ${ctx.userName.split(" ")[0]} ji. Maine ${chat.displayName} ko message bhej diya: ${messageText}`
          : `Done. Message sent to ${chat.displayName}.`,
        actions: [{ type: "open_chat", chatId: String(chat.chatId) }],
      };
    }

    case "messages_today": {
      const r = await query(
        `SELECT u.name, COUNT(m.id)::int AS msg_count,
                MAX(m.content) FILTER (WHERE m.type = 'text') AS last_text,
                MAX(m.type) AS last_type
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
         JOIN users u ON u.id = m.sender_id
         WHERE m.sender_id != $1
           AND m.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata')
           AND m.is_deleted = FALSE
         GROUP BY u.name
         ORDER BY msg_count DESC
         LIMIT 20`,
        [userId],
      );
      if (r.rows.length === 0) {
        return {
          intent: "messages_today",
          speak: locale === "hi"
            ? `${ctx.userName.split(" ")[0]} ji, aaj abhi tak kisi ka message nahi aaya.`
            : "No messages received today yet.",
          actions: [],
        };
      }
      const parts = r.rows.map((row: { name: string; msg_count: number; last_text?: string; last_type?: string }) => {
        const preview = messagePreview(row.last_type ?? "text", row.last_text ?? "");
        return `${row.name} se ${row.msg_count} message${row.msg_count > 1 ? "s" : ""}, last: ${preview}`;
      });
      return {
        intent: "messages_today",
        speak: locale === "hi"
          ? `${ctx.userName.split(" ")[0]} ji, aaj aapko message aaya: ${parts.join(". ")}.`
          : `Today's messages: ${parts.join(". ")}.`,
        data: { senders: r.rows },
        actions: [],
      };
    }

    case "messages_from":
    case "last_message_from": {
      const contactName = plan.contactName ?? "";
      const chat = await findChat(userId, contactName);
      if (!chat) {
        return {
          intent: plan.intent,
          speak: locale === "hi" ? `${contactName} ka chat nahi mila.` : `No chat found for ${contactName}.`,
          actions: [],
        };
      }
      const limit = plan.intent === "last_message_from" ? 1 : 5;
      const r = await query(
        `SELECT m.content, m.type, m.created_at
         FROM messages m
         WHERE m.chat_id = $1 AND m.sender_id != $2 AND m.is_deleted = FALSE
         ORDER BY m.created_at DESC
         LIMIT $3`,
        [chat.chatId, userId, limit],
      );
      if (r.rows.length === 0) {
        return {
          intent: plan.intent,
          speak: locale === "hi"
            ? `${chat.displayName} se abhi koi message nahi aaya.`
            : `No messages from ${chat.displayName}.`,
          actions: [],
        };
      }
      const lines = r.rows.map((row: { content: string; type: string }) =>
        messagePreview(row.type, row.content));
      return {
        intent: plan.intent,
        speak: locale === "hi"
          ? `${chat.displayName} ke messages: ${lines.join(". ")}.`
          : `Messages from ${chat.displayName}: ${lines.join(". ")}.`,
        actions: [{ type: "open_chat", chatId: String(chat.chatId) }],
        data: { messages: r.rows },
      };
    }

    case "unread_count": {
      const r = await query(
        `SELECT COUNT(*)::int AS cnt
         FROM messages m
         JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
         LEFT JOIN message_status ms ON ms.message_id = m.id AND ms.user_id = $1
         WHERE m.sender_id != $1
           AND m.is_deleted = FALSE
           AND (ms.status IS NULL OR ms.status != 'read')`,
        [userId],
      );
      const cnt = Number(r.rows[0]?.cnt ?? 0);
      return {
        intent: "unread_count",
        speak: locale === "hi"
          ? `${ctx.userName.split(" ")[0]} ji, aapke ${cnt} unread messages hain.`
          : `You have ${cnt} unread messages.`,
        actions: [],
      };
    }

    case "important_messages": {
      const r = await query(
        `SELECT u.name, m.content, m.type, c.id AS chat_id
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
         JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
         JOIN users u ON u.id = m.sender_id
         LEFT JOIN message_status ms ON ms.message_id = m.id AND ms.user_id = $1
         WHERE m.sender_id != $1
           AND m.is_deleted = FALSE
           AND (ms.status IS NULL OR ms.status != 'read')
           AND m.created_at >= NOW() - INTERVAL '7 days'
         ORDER BY m.created_at DESC
         LIMIT 10`,
        [userId],
      );
      if (r.rows.length === 0) {
        return {
          intent: "important_messages",
          speak: locale === "hi" ? "Koi unread important message nahi hai." : "No unread messages.",
          actions: [],
        };
      }
      const lines = r.rows.map((row: { name: string; content: string; type: string }) =>
        `${row.name}: ${messagePreview(row.type, row.content)}`);
      return {
        intent: "important_messages",
        speak: locale === "hi"
          ? `${ctx.userName.split(" ")[0]} ji, important messages: ${lines.join(". ")}.`
          : `Important messages: ${lines.join(". ")}.`,
        data: { messages: r.rows },
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
         WHERE m.sender_id != $1
           AND m.is_deleted = FALSE
           AND m.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata')
         GROUP BY COALESCE(u.name, c.group_name)
         ORDER BY total DESC
         LIMIT 15`,
        [userId],
      );
      if (r.rows.length === 0) {
        return {
          intent: "chat_summary",
          speak: locale === "hi" ? "Aaj koi chat activity nahi hai." : "No chat activity today.",
          actions: [],
        };
      }
      const parts = r.rows.map((row: { name: string; total: number; unread: number }) =>
        `${row.name}: ${row.total} messages, ${row.unread} unread`);
      return {
        intent: "chat_summary",
        speak: locale === "hi"
          ? `${ctx.userName.split(" ")[0]} ji, aaj ka summary: ${parts.join(". ")}.`
          : `Today's summary: ${parts.join(". ")}.`,
        data: { summary: r.rows },
        actions: [],
      };
    }

    case "list_contacts": {
      const names = [...ctx.contactNames, ...ctx.groupNames.map((g) => `${g} group`)];
      return {
        intent: "list_contacts",
        speak: locale === "hi"
          ? `Aapke chats: ${names.slice(0, 15).join(", ")}${names.length > 15 ? " aur aur bhi" : ""}.`
          : `Your chats: ${names.slice(0, 15).join(", ")}.`,
        data: { contacts: ctx.contactNames, groups: ctx.groupNames },
        actions: [],
      };
    }

    default:
      return {
        intent: "unknown",
        speak: plan.speak ?? (locale === "hi" ? "Samajh gaya, lekin abhi ye kaam nahi kar sakta." : "I understood but cannot do that yet."),
        actions: [],
      };
  }
}
