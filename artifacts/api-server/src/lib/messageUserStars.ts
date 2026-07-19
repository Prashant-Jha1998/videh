import { query } from "./db";

let tableReady = false;

/** Per-user starred messages (messages.is_starred is legacy/global and must not be used for UX). */
export async function ensureMessageUserStarsTable(): Promise<void> {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS message_user_stars (
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_message_user_stars_user ON message_user_stars(user_id, created_at DESC)`,
  );
  tableReady = true;
}

/** SQL: boolean whether viewer starred this message. */
export function messageStarredByViewerSql(viewerParam: string): string {
  return `EXISTS (
      SELECT 1 FROM message_user_stars s
      WHERE s.message_id = m.id AND s.user_id = ${viewerParam}::int
    )`;
}

export async function toggleMessageStarForUser(
  messageId: number,
  userId: number,
): Promise<boolean> {
  await ensureMessageUserStarsTable();
  const existing = await query(
    `SELECT 1 FROM message_user_stars WHERE message_id = $1 AND user_id = $2`,
    [messageId, userId],
  );
  if (existing.rows.length > 0) {
    await query(
      `DELETE FROM message_user_stars WHERE message_id = $1 AND user_id = $2`,
      [messageId, userId],
    );
    return false;
  }
  await query(
    `INSERT INTO message_user_stars (message_id, user_id) VALUES ($1, $2)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
    [messageId, userId],
  );
  return true;
}
