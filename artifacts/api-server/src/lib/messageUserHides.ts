import { query } from "./db";

let tableReady = false;

export async function ensureMessageUserHidesTable(): Promise<void> {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS message_user_hides (
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_message_user_hides_user ON message_user_hides(user_id, created_at DESC)`,
  );
  tableReady = true;
}

/** SQL fragment: message visible to viewer (not hidden, not deleted). */
export function messageVisibleToUserSql(viewerParam: string): string {
  return `m.is_deleted = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM message_user_hides h
      WHERE h.message_id = m.id AND h.user_id = ${viewerParam}::int
    )`;
}

export async function hideMessageForUser(messageId: number, userId: number): Promise<void> {
  await ensureMessageUserHidesTable();
  await query(
    `INSERT INTO message_user_hides (message_id, user_id) VALUES ($1, $2)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
    [messageId, userId],
  );
}
