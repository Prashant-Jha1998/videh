import { query } from "./db";
import { publishChatEvent } from "./realtime";

export async function insertChatSystemMessage(
  chatId: string | number,
  senderId: number,
  payload: Record<string, unknown>,
): Promise<{ messageId: number; content: string }> {
  const systemContent = JSON.stringify(payload);
  const msgResult = await query(
    `INSERT INTO messages (chat_id, sender_id, content, type)
     VALUES ($1, $2, $3, 'system')
     RETURNING id`,
    [chatId, senderId, systemContent],
  );
  const messageId = Number(msgResult.rows[0].id);

  const members = await query("SELECT user_id FROM chat_members WHERE chat_id = $1", [chatId]);
  const memberIds = members.rows
    .map((row: { user_id: number }) => Number(row.user_id))
    .filter(Boolean);
  const recipientIds = memberIds.filter((id) => id !== senderId);
  if (recipientIds.length > 0) {
    await query(
      `INSERT INTO message_status (message_id, user_id, status)
       SELECT $1, unnest($2::int[]), 'delivered'
       ON CONFLICT (message_id, user_id)
       DO UPDATE SET status = 'delivered', updated_at = NOW()`,
      [messageId, recipientIds],
    );
  }

  publishChatEvent({
    type: "message",
    chatId: String(chatId),
    userIds: memberIds,
    payload: {
      messageId,
      content: systemContent,
      type: "system",
      senderId,
    },
  });

  return { messageId, content: systemContent };
}
