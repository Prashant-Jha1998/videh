import { query } from "./db";

export type NotificationPrefs = {
  messages: boolean;
  groups: boolean;
  calls: boolean;
  status: boolean;
  reactions: boolean;
  messageVibrate: boolean;
  groupVibrate: boolean;
  preview: "always" | "name" | "none";
};

const DEFAULTS: NotificationPrefs = {
  messages: true,
  groups: true,
  calls: true,
  status: true,
  reactions: true,
  messageVibrate: true,
  groupVibrate: true,
  preview: "always",
};

let ensured = false;

export async function ensureNotificationPrefsColumn(): Promise<void> {
  if (ensured) return;
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  ensured = true;
}

export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const preview =
    o.preview === "name" || o.preview === "none" || o.preview === "always"
      ? o.preview
      : DEFAULTS.preview;
  return {
    messages: o.messages !== false,
    groups: o.groups !== false,
    calls: o.calls !== false,
    status: o.status !== false,
    reactions: o.reactions !== false,
    messageVibrate: o.messageVibrate !== false,
    groupVibrate: o.groupVibrate !== false,
    preview,
  };
}

export async function getNotificationPrefs(userId: number): Promise<NotificationPrefs> {
  await ensureNotificationPrefsColumn();
  const r = await query(`SELECT notification_prefs FROM users WHERE id = $1`, [userId]);
  return normalizeNotificationPrefs(r.rows[0]?.notification_prefs);
}

export async function setNotificationPrefs(
  userId: number,
  patch: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
  await ensureNotificationPrefsColumn();
  const current = await getNotificationPrefs(userId);
  const next = normalizeNotificationPrefs({ ...current, ...patch });
  await query(`UPDATE users SET notification_prefs = $1::jsonb WHERE id = $2`, [
    JSON.stringify(next),
    userId,
  ]);
  return next;
}

export async function shouldSendPushForKind(
  userId: number,
  kind: "messages" | "groups" | "calls" | "status" | "reactions",
): Promise<boolean> {
  const prefs = await getNotificationPrefs(userId);
  return prefs[kind] !== false;
}
