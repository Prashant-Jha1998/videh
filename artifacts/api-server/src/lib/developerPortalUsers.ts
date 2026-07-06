import crypto from "node:crypto";
import { query } from "./db";
import { hashAdminPassword, verifyAdminPassword } from "./adminPassword";
import { ensureDeveloperPlatformTables } from "./developerPlatform";

export type DeveloperPortalUserRow = {
  id: number;
  email: string;
  password_hash: string;
  full_name: string | null;
  google_sub: string | null;
  auth_provider: string | null;
  created_at: string;
  last_login_at: string | null;
};

export async function ensureDeveloperPortalUsersTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS developer_portal_users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_portal_users_email
      ON developer_portal_users (LOWER(email))
  `);
  try {
    await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS portal_user_id INTEGER REFERENCES developer_portal_users(id) ON DELETE SET NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_developer_leads_portal_user ON developer_leads(portal_user_id)`);
  } catch {
    /* ignore */
  }
  await query(`ALTER TABLE developer_portal_users ADD COLUMN IF NOT EXISTS google_sub TEXT`);
  await query(`ALTER TABLE developer_portal_users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'password'`);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_portal_users_google_sub
      ON developer_portal_users (google_sub) WHERE google_sub IS NOT NULL
  `);
}

const portalUserSelect = `id, email, password_hash, full_name, google_sub, auth_provider, created_at, last_login_at`;

export function normalizePortalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findPortalUserByEmail(email: string): Promise<DeveloperPortalUserRow | null> {
  await ensureDeveloperPortalUsersTable();
  const r = await query(
    `SELECT ${portalUserSelect}
     FROM developer_portal_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [normalizePortalEmail(email)],
  );
  return (r.rows[0] as DeveloperPortalUserRow | undefined) ?? null;
}

export async function findPortalUserById(id: number): Promise<DeveloperPortalUserRow | null> {
  await ensureDeveloperPortalUsersTable();
  const r = await query(
    `SELECT ${portalUserSelect}
     FROM developer_portal_users WHERE id = $1`,
    [id],
  );
  return (r.rows[0] as DeveloperPortalUserRow | undefined) ?? null;
}

export async function createPortalUser(input: {
  email: string;
  password: string;
  fullName?: string;
}): Promise<DeveloperPortalUserRow> {
  await ensureDeveloperPortalUsersTable();
  const email = normalizePortalEmail(input.email);
  const password_hash = await hashAdminPassword(input.password);
  const r = await query(
    `INSERT INTO developer_portal_users (email, password_hash, full_name, auth_provider)
     VALUES ($1, $2, $3, 'password')
     RETURNING ${portalUserSelect}`,
    [email, password_hash, input.fullName?.trim() || null],
  );
  return r.rows[0] as DeveloperPortalUserRow;
}

export async function findPortalUserByGoogleSub(googleSub: string): Promise<DeveloperPortalUserRow | null> {
  await ensureDeveloperPortalUsersTable();
  const r = await query(
    `SELECT ${portalUserSelect}
     FROM developer_portal_users WHERE google_sub = $1 LIMIT 1`,
    [googleSub],
  );
  return (r.rows[0] as DeveloperPortalUserRow | undefined) ?? null;
}

export async function createPortalUserFromGoogle(input: {
  email: string;
  googleSub: string;
  fullName?: string | null;
}): Promise<DeveloperPortalUserRow> {
  await ensureDeveloperPortalUsersTable();
  const email = normalizePortalEmail(input.email);
  const password_hash = await hashAdminPassword(crypto.randomBytes(32).toString("hex"));
  const r = await query(
    `INSERT INTO developer_portal_users (email, password_hash, full_name, google_sub, auth_provider)
     VALUES ($1, $2, $3, $4, 'google')
     RETURNING ${portalUserSelect}`,
    [email, password_hash, input.fullName?.trim() || null, input.googleSub],
  );
  return r.rows[0] as DeveloperPortalUserRow;
}

export async function linkPortalUserGoogle(
  userId: number,
  googleSub: string,
  fullName?: string | null,
): Promise<DeveloperPortalUserRow | null> {
  await ensureDeveloperPortalUsersTable();
  const taken = await findPortalUserByGoogleSub(googleSub);
  if (taken && taken.id !== userId) {
    throw Object.assign(new Error("google_sub_taken"), { code: "23505" });
  }
  const r = await query(
    `UPDATE developer_portal_users
     SET google_sub = $2,
         auth_provider = 'google',
         full_name = COALESCE(NULLIF(full_name, ''), $3),
         last_login_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${portalUserSelect}`,
    [userId, googleSub, fullName?.trim() || null],
  );
  return (r.rows[0] as DeveloperPortalUserRow | undefined) ?? null;
}

export async function touchPortalUserLogin(userId: number): Promise<void> {
  await query(`UPDATE developer_portal_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, [userId]);
}

export async function verifyPortalUserPassword(
  email: string,
  password: string,
): Promise<DeveloperPortalUserRow | null> {
  const user = await findPortalUserByEmail(email);
  if (!user) return null;
  const ok = await verifyAdminPassword(password, user.password_hash);
  if (!ok) return null;
  await query(`UPDATE developer_portal_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, [user.id]);
  return user;
}

export async function updatePortalUserPassword(userId: number, password: string): Promise<void> {
  const password_hash = await hashAdminPassword(password);
  await query(`UPDATE developer_portal_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [
    password_hash,
    userId,
  ]);
}

type ActiveLeadSummary = {
  id: number;
  reference_code: string;
  wizard_step: string;
  status: string;
  company_name: string;
  payment_method_verified: boolean;
  has_api_account: boolean;
};

function mapActiveLeadRow(row: Record<string, unknown>): ActiveLeadSummary {
  return {
    id: Number(row.id),
    reference_code: String(row.reference_code),
    wizard_step: String(row.wizard_step),
    status: String(row.status),
    company_name: String(row.company_name),
    payment_method_verified: Boolean(row.payment_method_verified),
    has_api_account: Boolean(row.has_api_account),
  };
}

/** Attach orphan applications (same email, no portal_user_id) to the signed-in developer account */
export async function linkLeadToPortalUserIfNeeded(
  leadId: number,
  userId: number,
  email: string,
): Promise<void> {
  await ensureDeveloperPortalUsersTable();
  const norm = normalizePortalEmail(email);
  await query(
    `UPDATE developer_leads
     SET portal_user_id = $1, updated_at = NOW()
     WHERE id = $2
       AND status NOT IN ('rejected')
       AND (portal_user_id IS NULL OR portal_user_id = $1)
       AND LOWER(TRIM(email)) = $3`,
    [userId, leadId, norm],
  );
}

export async function getActiveLeadForPortalUser(
  userId: number,
  email?: string,
): Promise<ActiveLeadSummary | null> {
  await ensureDeveloperPortalUsersTable();
  await ensureDeveloperPlatformTables();
  const r = await query(
    `SELECT l.id, l.reference_code, l.wizard_step, l.status, l.company_name,
            COALESCE(l.payment_method_verified, false) AS payment_method_verified,
            EXISTS(SELECT 1 FROM developer_api_accounts a WHERE a.lead_id = l.id) AS has_api_account
     FROM developer_leads l
     WHERE l.portal_user_id = $1 AND l.status NOT IN ('rejected')
     ORDER BY l.updated_at DESC
     LIMIT 1`,
    [userId],
  );
  if (r.rows[0]) return mapActiveLeadRow(r.rows[0] as Record<string, unknown>);

  const norm = email ? normalizePortalEmail(email) : "";
  if (!norm) return null;

  const orphan = await query(
    `SELECT l.id, l.reference_code, l.wizard_step, l.status, l.company_name,
            COALESCE(l.payment_method_verified, false) AS payment_method_verified,
            EXISTS(SELECT 1 FROM developer_api_accounts a WHERE a.lead_id = l.id) AS has_api_account
     FROM developer_leads l
     WHERE l.portal_user_id IS NULL AND l.status NOT IN ('rejected') AND LOWER(TRIM(l.email)) = $1
     ORDER BY l.updated_at DESC
     LIMIT 1`,
    [norm],
  );
  const row = orphan.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  await query(`UPDATE developer_leads SET portal_user_id = $1, updated_at = NOW() WHERE id = $2`, [userId, row.id]);
  return mapActiveLeadRow(row);
}
