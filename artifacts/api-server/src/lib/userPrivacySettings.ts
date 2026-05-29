import { query } from "./db";
import { areContacts, isBlocked } from "./presencePrivacy";

export type FieldPrivacy = "everyone" | "contacts" | "nobody";

export type ExtendedPrivacyRow = {
  id: number;
  profile_photo_privacy: FieldPrivacy;
  about_privacy: FieldPrivacy;
  status_privacy: FieldPrivacy;
  groups_privacy: FieldPrivacy;
  read_receipts_enabled: boolean;
  default_disappear_seconds: number | null;
  silence_unknown_callers: boolean;
};

let columnsEnsured = false;

export async function ensureExtendedPrivacyColumns(): Promise<void> {
  if (columnsEnsured) return;
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_privacy TEXT NOT NULL DEFAULT 'contacts';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS about_privacy TEXT NOT NULL DEFAULT 'contacts';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status_privacy TEXT NOT NULL DEFAULT 'contacts';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS groups_privacy TEXT NOT NULL DEFAULT 'everyone';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS read_receipts_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS default_disappear_seconds INTEGER;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS silence_unknown_callers BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  columnsEnsured = true;
}

function normalizeFieldPrivacy(v: unknown, fallback: FieldPrivacy): FieldPrivacy {
  if (v === "everyone" || v === "contacts" || v === "nobody") return v;
  return fallback;
}

export async function getExtendedPrivacy(userId: number): Promise<ExtendedPrivacyRow | null> {
  await ensureExtendedPrivacyColumns();
  const r = await query(
    `SELECT id, profile_photo_privacy, about_privacy, status_privacy, groups_privacy,
            read_receipts_enabled, default_disappear_seconds, silence_unknown_callers
     FROM users WHERE id = $1`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    profile_photo_privacy: normalizeFieldPrivacy(row.profile_photo_privacy, "contacts"),
    about_privacy: normalizeFieldPrivacy(row.about_privacy, "contacts"),
    status_privacy: normalizeFieldPrivacy(row.status_privacy, "contacts"),
    groups_privacy: normalizeFieldPrivacy(row.groups_privacy, "everyone"),
    read_receipts_enabled: row.read_receipts_enabled !== false,
    default_disappear_seconds:
      row.default_disappear_seconds != null ? Number(row.default_disappear_seconds) : null,
    silence_unknown_callers: Boolean(row.silence_unknown_callers),
  };
}

function allowsFieldPrivacy(owner: FieldPrivacy, isContact: boolean): boolean {
  switch (owner) {
    case "everyone":
      return true;
    case "nobody":
      return false;
    case "contacts":
    default:
      return isContact;
  }
}

export async function canSeeUserField(
  viewerId: number,
  targetId: number,
  field: keyof Pick<ExtendedPrivacyRow, "profile_photo_privacy" | "about_privacy" | "status_privacy">,
): Promise<boolean> {
  if (viewerId === targetId) return true;
  if (await isBlocked(viewerId, targetId)) return false;
  const target = await getExtendedPrivacy(targetId);
  if (!target) return false;
  const contact = await areContacts(viewerId, targetId);
  return allowsFieldPrivacy(target[field], contact);
}

/** Whether `adderId` may add `targetId` to a group. */
export async function canAddUserToGroup(adderId: number, targetId: number): Promise<boolean> {
  if (adderId === targetId) return true;
  if (await isBlocked(adderId, targetId)) return false;
  const target = await getExtendedPrivacy(targetId);
  if (!target) return false;
  const contact = await areContacts(adderId, targetId);
  return allowsFieldPrivacy(target.groups_privacy, contact);
}

export function fieldPrivacyLabel(v: FieldPrivacy): string {
  const map: Record<FieldPrivacy, string> = {
    everyone: "Everyone",
    contacts: "My contacts",
    nobody: "Nobody",
  };
  return map[v] ?? "My contacts";
}

export function labelToFieldPrivacy(label: string): FieldPrivacy {
  if (label === "Everyone") return "everyone";
  if (label === "Nobody") return "nobody";
  return "contacts";
}

export function disappearLabel(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "Off";
  if (seconds === 86400) return "24 hours";
  if (seconds === 604800) return "7 days";
  if (seconds === 7776000) return "90 days";
  return "On";
}
