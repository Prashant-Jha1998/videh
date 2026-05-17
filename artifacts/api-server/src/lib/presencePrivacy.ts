import { query } from "./db";

export type LastSeenPrivacy = "everyone" | "contacts" | "contacts_except" | "nobody";
export type OnlinePrivacy = "everyone" | "same_as_last_seen";

export type PrivacyRow = {
  id: number;
  last_seen_privacy: LastSeenPrivacy;
  online_privacy: OnlinePrivacy;
  last_seen_except_ids: number[];
};

let columnsEnsured = false;

export async function ensurePrivacyColumns(): Promise<void> {
  if (columnsEnsured) return;
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_privacy TEXT NOT NULL DEFAULT 'contacts';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS online_privacy TEXT NOT NULL DEFAULT 'same_as_last_seen';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_except_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  columnsEnsured = true;
}

function parseExceptIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0);
}

function normalizeLastSeenPrivacy(v: unknown): LastSeenPrivacy {
  if (v === "everyone" || v === "contacts" || v === "contacts_except" || v === "nobody") return v;
  return "contacts";
}

function normalizeOnlinePrivacy(v: unknown): OnlinePrivacy {
  if (v === "everyone" || v === "same_as_last_seen") return v;
  return "same_as_last_seen";
}

export async function getUserPrivacy(userId: number): Promise<PrivacyRow | null> {
  await ensurePrivacyColumns();
  const r = await query(
    `SELECT id, last_seen_privacy, online_privacy, last_seen_except_ids FROM users WHERE id = $1`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    last_seen_privacy: normalizeLastSeenPrivacy(row.last_seen_privacy),
    online_privacy: normalizeOnlinePrivacy(row.online_privacy),
    last_seen_except_ids: parseExceptIds(row.last_seen_except_ids),
  };
}

export async function isBlocked(a: number, b: number): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM blocked_users
     WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`,
    [a, b],
  );
  return r.rows.length > 0;
}

/** Shared 1:1 chat = contact (Videh has no separate contacts sync). */
export async function areContacts(a: number, b: number): Promise<boolean> {
  if (a === b) return true;
  const r = await query(
    `SELECT 1
     FROM chat_members cm1
     JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id
     JOIN chats c ON c.id = cm1.chat_id AND c.is_group = FALSE
     WHERE cm1.user_id = $1 AND cm2.user_id = $2
     LIMIT 1`,
    [a, b],
  );
  return r.rows.length > 0;
}

function allowsByLastSeenPrivacy(
  owner: PrivacyRow,
  viewerId: number,
  isContact: boolean,
): boolean {
  switch (owner.last_seen_privacy) {
    case "everyone":
      return true;
    case "nobody":
      return false;
    case "contacts":
      return isContact;
    case "contacts_except":
      if (!isContact) return false;
      return !owner.last_seen_except_ids.includes(viewerId);
    default:
      return isContact;
  }
}

/** If you hide last seen, you cannot see others' (WhatsApp reciprocal rule). */
export function viewerSharesOwnPresence(viewer: PrivacyRow): boolean {
  return viewer.last_seen_privacy !== "nobody";
}

export async function canSeeLastSeen(viewerId: number, targetId: number): Promise<boolean> {
  if (viewerId === targetId) return true;
  if (await isBlocked(viewerId, targetId)) return false;

  const [viewer, target] = await Promise.all([getUserPrivacy(viewerId), getUserPrivacy(targetId)]);
  if (!viewer || !target) return false;
  if (!viewerSharesOwnPresence(viewer)) return false;

  const contact = await areContacts(viewerId, targetId);
  if (!allowsByLastSeenPrivacy(target, viewerId, contact)) return false;

  return allowsByLastSeenPrivacy(viewer, targetId, contact);
}

export async function canSeeOnline(viewerId: number, targetId: number): Promise<boolean> {
  if (viewerId === targetId) return true;
  if (await isBlocked(viewerId, targetId)) return false;
  const viewer = await getUserPrivacy(viewerId);
  if (!viewer || !viewerSharesOwnPresence(viewer)) return false;

  const target = await getUserPrivacy(targetId);
  if (!target) return false;

  if (target.online_privacy === "everyone") {
    return true;
  }
  return canSeeLastSeen(viewerId, targetId);
}

export type PresencePayload = {
  canSee: boolean;
  isOnline: boolean;
  lastSeen: string | null;
};

export async function getPresenceForViewer(viewerId: number, targetId: number): Promise<PresencePayload> {
  const hidden: PresencePayload = { canSee: false, isOnline: false, lastSeen: null };
  if (viewerId === targetId) {
    const r = await query(`SELECT is_online, last_seen FROM users WHERE id = $1`, [targetId]);
    const row = r.rows[0];
    return {
      canSee: true,
      isOnline: Boolean(row?.is_online),
      lastSeen: row?.last_seen ? new Date(row.last_seen).toISOString() : null,
    };
  }

  const [seeOnline, seeLastSeen] = await Promise.all([
    canSeeOnline(viewerId, targetId),
    canSeeLastSeen(viewerId, targetId),
  ]);
  if (!seeOnline && !seeLastSeen) return hidden;

  const r = await query(`SELECT is_online, last_seen FROM users WHERE id = $1`, [targetId]);
  const row = r.rows[0];
  if (!row) return hidden;

  return {
    canSee: true,
    isOnline: seeOnline ? Boolean(row.is_online) : false,
    lastSeen: seeLastSeen && row.last_seen ? new Date(row.last_seen).toISOString() : null,
  };
}

export function privacyLabels(lastSeen: LastSeenPrivacy, online: OnlinePrivacy): {
  lastSeenLabel: string;
  onlineLabel: string;
} {
  const lastMap: Record<LastSeenPrivacy, string> = {
    everyone: "Everyone",
    contacts: "My contacts",
    contacts_except: "My contacts except...",
    nobody: "Nobody",
  };
  const onlineMap: Record<OnlinePrivacy, string> = {
    everyone: "Everyone",
    same_as_last_seen: "Same as last seen",
  };
  return {
    lastSeenLabel: lastMap[lastSeen] ?? "My contacts",
    onlineLabel: onlineMap[online] ?? "Same as last seen",
  };
}
