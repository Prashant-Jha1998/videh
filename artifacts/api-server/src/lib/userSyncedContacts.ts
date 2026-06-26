import { query } from "./db";
import { normalizePhone } from "./phoneNormalize";

let tableEnsured = false;

export async function ensureUserSyncedContactsTable(): Promise<void> {
  if (tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS user_synced_contacts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, phone)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_user_synced_contacts_user ON user_synced_contacts(user_id)`);
  tableEnsured = true;
}

function blockedClause(userIdParam: string): string {
  return `
    NOT EXISTS (
      SELECT 1 FROM blocked_users b
      WHERE (b.blocker_id = ${userIdParam} AND b.blocked_id = u.id)
         OR (b.blocker_id = u.id AND b.blocked_id = ${userIdParam})
    )
  `;
}

type ContactRow = { id: number; phone: string; name: string; avatar_url: string | null; about: string | null };

function phoneDigits(column: string): string {
  return `regexp_replace(${column}, '[^0-9]', '', 'g')`;
}

/** Phone-synced Videh users + people you already chat with (Videh Web style). */
export async function listVidehContactsForUser(userId: number): Promise<ContactRow[]> {
  await ensureUserSyncedContactsTable();

  const synced = await query(
    `SELECT u.id, u.phone,
            COALESCE(
              (SELECT NULLIF(TRIM(sc.display_name), '')
               FROM user_synced_contacts sc
               WHERE sc.user_id = $1
                 AND ${phoneDigits("sc.phone")} = ${phoneDigits("u.phone")}
               LIMIT 1),
              u.name, u.phone
            ) AS name,
            u.avatar_url, u.about
     FROM users u
     WHERE u.id != $1 AND ${blockedClause("$1")}
       AND ${phoneDigits("u.phone")} IN (
         SELECT ${phoneDigits("sc.phone")}
         FROM user_synced_contacts sc
         WHERE sc.user_id = $1
       )
     ORDER BY name ASC NULLS LAST
     LIMIT 2000`,
    [userId],
  );

  const chatOnly = await query(
    `SELECT u.id, u.phone, COALESCE(u.name, u.phone) AS name, u.avatar_url, u.about
     FROM users u
     WHERE u.id != $1 AND ${blockedClause("$1")}
       AND u.id IN (
         SELECT cm_other.user_id
         FROM chat_members cm_self
         JOIN chat_members cm_other ON cm_other.chat_id = cm_self.chat_id AND cm_other.user_id != cm_self.user_id
         WHERE cm_self.user_id = $1
       )
       AND NOT EXISTS (
         SELECT 1 FROM user_synced_contacts sc
         WHERE sc.user_id = $1
           AND ${phoneDigits("sc.phone")} = ${phoneDigits("u.phone")}
       )
     ORDER BY name ASC NULLS LAST
     LIMIT 500`,
    [userId],
  );

  const byId = new Map<number, ContactRow>();
  for (const row of synced.rows as ContactRow[]) byId.set(row.id, row);
  for (const row of chatOnly.rows as ContactRow[]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }

  return [...byId.values()].sort((a, b) =>
    (a.name ?? a.phone ?? "").localeCompare(b.name ?? b.phone ?? "", undefined, { sensitivity: "base" }),
  );
}

export async function replaceUserSyncedContacts(
  userId: number,
  contacts: Array<{ phone: string; name?: string }>,
): Promise<number> {
  await ensureUserSyncedContactsTable();

  const deduped = new Map<string, string>();
  for (const c of contacts) {
    const phone = normalizePhone(c.phone);
    if (!phone) continue;
    const name = String(c.name ?? "").trim().slice(0, 120);
    deduped.set(phone, name);
  }

  const phones = [...deduped.keys()];
  const names = phones.map((p) => deduped.get(p) ?? "");

  await query("DELETE FROM user_synced_contacts WHERE user_id = $1", [userId]);
  if (phones.length === 0) return 0;

  await query(
    `INSERT INTO user_synced_contacts (user_id, phone, display_name)
     SELECT $1, phone, name
     FROM unnest($2::text[], $3::text[]) AS t(phone, name)`,
    [userId, phones, names],
  );

  return phones.length;
}
