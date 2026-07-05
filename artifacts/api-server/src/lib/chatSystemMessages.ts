import { query } from "./db";
import { publishChatEvent } from "./realtime";

export async function userDisplayName(userId: number): Promise<string> {
  const r = await query("SELECT name FROM users WHERE id = $1", [userId]);
  const name = String(r.rows[0]?.name ?? "").trim();
  return name || "Someone";
}

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
