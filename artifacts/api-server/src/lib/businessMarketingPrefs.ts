import { query } from "./db";

let tableReady = false;

export async function ensureBusinessMarketingPrefsTable(): Promise<void> {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS user_business_marketing_prefs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      marketing_stopped BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, business_user_id)
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_business_marketing_stopped
    ON user_business_marketing_prefs (business_user_id, user_id)
    WHERE marketing_stopped = TRUE
  `);
  tableReady = true;
}

export async function isBusinessMarketingStopped(
  userId: number,
  businessUserId: number,
): Promise<boolean> {
  await ensureBusinessMarketingPrefsTable();
  const r = await query(
    `SELECT marketing_stopped FROM user_business_marketing_prefs
     WHERE user_id = $1 AND business_user_id = $2`,
    [userId, businessUserId],
  );
  return Boolean(r.rows[0]?.marketing_stopped);
}

export async function setBusinessMarketingStopped(
  userId: number,
  businessUserId: number,
  stopped: boolean,
): Promise<void> {
  await ensureBusinessMarketingPrefsTable();
  await query(
    `INSERT INTO user_business_marketing_prefs (user_id, business_user_id, marketing_stopped, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, business_user_id)
     DO UPDATE SET marketing_stopped = EXCLUDED.marketing_stopped, updated_at = NOW()`,
    [userId, businessUserId, stopped],
  );
}
