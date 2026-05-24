import { query } from "./db";

export async function userIsChatMember(chatId: number, userId: number): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2 LIMIT 1`,
    [chatId, userId],
  );
  return result.rows.length > 0;
}

export async function assertChatMember(
  chatId: number,
  userId: number,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!chatId || !userId) {
    return { ok: false, status: 400, message: "Invalid chat or user." };
  }
  const member = await userIsChatMember(chatId, userId);
  if (!member) {
    return { ok: false, status: 403, message: "You are not a member of this chat." };
  }
  return { ok: true };
}

export async function getUserDisplayName(userId: number): Promise<string> {
  const result = await query(`SELECT name FROM users WHERE id = $1`, [userId]);
  return String(result.rows[0]?.name ?? "Member");
}
