import { query } from "./db";

let ensured = false;

export async function ensureAdminPlatformTables(): Promise<void> {
  if (ensured) return;

  await query(`
    ALTER TABLE user_reports
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS priority_score INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS assigned_admin TEXT,
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS resolution_note TEXT,
      ADD COLUMN IF NOT EXISTS admin_action TEXT
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id SERIAL PRIMARY KEY,
      admin_email TEXT NOT NULL,
      admin_role TEXT NOT NULL DEFAULT 'super_admin',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      metadata JSONB NOT NULL DEFAULT '{}',
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS grievance_tickets (
      id SERIAL PRIMARY KEY,
      ticket_number TEXT NOT NULL UNIQUE,
      complainant_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      sla_ack_due_at TIMESTAMPTZ NOT NULL,
      sla_resolve_due_at TIMESTAMPTZ NOT NULL,
      first_response_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      assigned_admin TEXT,
      resolution_note TEXT,
      linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS legal_requests (
      id SERIAL PRIMARY KEY,
      reference_number TEXT NOT NULL UNIQUE,
      agency_name TEXT NOT NULL,
      officer_name TEXT,
      officer_email TEXT,
      request_type TEXT NOT NULL DEFAULT 'data_preservation',
      user_identifiers JSONB NOT NULL DEFAULT '[]',
      scope TEXT,
      status TEXT NOT NULL DEFAULT 'received',
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      due_at TIMESTAMPTZ,
      fulfilled_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS data_subject_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      subject_phone TEXT,
      request_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_verification',
      submitted_via TEXT NOT NULL DEFAULT 'admin',
      verified_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      admin_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS platform_incidents (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'investigating',
      feature_flags JSONB NOT NULL DEFAULT '{}',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  ensured = true;
}

export function grievanceTicketNumber(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `GRV-${y}${m}${day}-${rand}`;
}

export function legalReferenceNumber(): string {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `LR-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

/** IT Rules grievance: first response within 36 hours; resolution target 15 days. */
export function grievanceSlaTimestamps(): { ackDue: Date; resolveDue: Date } {
  const now = Date.now();
  return {
    ackDue: new Date(now + 36 * 3_600_000),
    resolveDue: new Date(now + 15 * 24 * 3_600_000),
  };
}
