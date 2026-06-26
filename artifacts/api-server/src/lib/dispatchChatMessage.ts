import { query } from "./db";
import { publishChatEvent } from "./realtime";
import { isValidPushToken, sendPushBatch } from "./pushNotify";

type SentMessageRow = {
  id: number;
  chat_id: number;
  sender_id: number;
  content: string;
  type: string;
  media_url?: string | null;
};

/** Notify chat members after a message row exists (scheduled cron, system jobs, etc.). */
export async function notifyChatMessageDelivered(args: {
  message: SentMessageRow;
  senderName?: string | null;
  senderId: number;
  chatId: number;
}): Promise<void> {
  const { message, senderId, chatId } = args;
  const senderName = args.senderName?.trim() || "Videh";

  const members = await query(
    `SELECT u.id AS user_id, u.push_token, u.name, cm.is_muted
     FROM chat_members cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.chat_id = $1 AND cm.user_id != $2`,
    [chatId, senderId],
  );
  const recipientIds = members.rows
    .map((row: { user_id: number }) => Number(row.user_id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (recipientIds.length > 0) {
    await query(
      `INSERT INTO message_status (message_id, user_id, status)
       SELECT $1, unnest($2::int[]), 'delivered'
       ON CONFLICT (message_id, user_id)
       DO UPDATE SET status = 'delivered', updated_at = NOW()`,
      [message.id, recipientIds],
    );
  }

  publishChatEvent({
    type: "message",
    chatId,
    userIds: [senderId, ...recipientIds],
    payload: {
      messageId: message.id,
      content: message.content ?? "",
      type: message.type ?? "text",
      mediaUrl: message.media_url ?? undefined,
      senderId,
      senderName,
    },
  });

  const notifyMembers = members.rows.filter((m: { is_muted?: boolean }) => !m.is_muted);
  if (notifyMembers.length > 0) {
    const batch = notifyMembers
      .filter((r: { push_token: string | null }) => isValidPushToken(r.push_token))
      .map((r: { push_token: string | null }) => ({
        token: r.push_token!,
        title: senderName,
        body: String(message.content ?? "").slice(0, 100),
        data: { chatId: String(chatId), type: "message", messageId: String(message.id) },
      }));
    if (batch.length > 0) await sendPushBatch(batch);
  }
}
