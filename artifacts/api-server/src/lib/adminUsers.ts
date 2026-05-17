import { query } from "./db";
import { hashAdminPassword, verifyAdminPassword } from "./adminPassword";
import { isAdminRole, type AdminRole } from "./adminRbac";

let ensured = false;

export type AdminUserRow = {
  id: number;
  email: string;
  password_hash: string;
  role: AdminRole;
  totp_secret: string | null;
  display_name: string | null;
  is_active: boolean;
};

export async function ensureAdminUsersTable(): Promise<void> {
  if (ensured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'moderator',
      totp_secret TEXT,
      display_name TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS admin_escalation_log (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      escalation_type TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (entity_type, entity_id, escalation_type)
    )
  `);
  await query(`ALTER TABLE grievance_tickets ADD COLUMN IF NOT EXISTS submitted_via TEXT NOT NULL DEFAULT 'admin'`);

  const count = await query(`SELECT COUNT(*)::int AS c FROM admin_users`, []);
  const n = Number((count.rows[0] as { c: number })?.c ?? 0);
  if (n === 0) {
    const email = process.env["ADMIN_EMAIL"]?.trim().toLowerCase();
    const pass = process.env["ADMIN_PASSWORD"] ?? "";
    const totp = process.env["ADMIN_TOTP_SECRET"]?.trim() || null;
    if (email && pass) {
      const password_hash = await hashAdminPassword(pass);
      await query(
        `INSERT INTO admin_users (email, password_hash, role, totp_secret, display_name)
         VALUES ($1, $2, 'super_admin', $3, 'Platform super admin')
         ON CONFLICT (email) DO NOTHING`,
        [email, password_hash, totp],
      );
    }
  }
  ensured = true;
}

export async function findAdminByEmail(email: string): Promise<AdminUserRow | null> {
  await ensureAdminUsersTable();
  const r = await query(
    `SELECT id, email, password_hash, role, totp_secret, display_name, is_active
     FROM admin_users WHERE email = $1 AND is_active = TRUE LIMIT 1`,
    [email.trim().toLowerCase()],
  );
  const row = r.rows[0] as AdminUserRow | undefined;
  if (!row || !isAdminRole(row.role)) return null;
  return row;
}

export async function verifyAdminCredentials(email: string, password: string): Promise<AdminUserRow | null> {
  const admin = await findAdminByEmail(email);
  if (!admin) return null;
  const ok = await verifyAdminPassword(password, admin.password_hash);
  return ok ? admin : null;
}

export async function touchAdminLogin(adminId: number): Promise<void> {
  await query(`UPDATE admin_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, [adminId]);
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  await ensureAdminUsersTable();
  const r = await query(
    `SELECT id, email, password_hash, role, totp_secret, display_name, is_active
     FROM admin_users ORDER BY id ASC`,
    [],
  );
  return (r.rows as AdminUserRow[]).filter((a) => isAdminRole(a.role));
}

export async function createAdminUser(input: {
  email: string;
  password: string;
  role: AdminRole;
  totpSecret?: string | null;
  displayName?: string | null;
}): Promise<AdminUserRow> {
  await ensureAdminUsersTable();
  const password_hash = await hashAdminPassword(input.password);
  const r = await query(
    `INSERT INTO admin_users (email, password_hash, role, totp_secret, display_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, password_hash, role, totp_secret, display_name, is_active`,
    [
      input.email.trim().toLowerCase(),
      password_hash,
      input.role,
      input.totpSecret?.trim() || null,
      input.displayName?.trim() || null,
    ],
  );
  return r.rows[0] as AdminUserRow;
}
