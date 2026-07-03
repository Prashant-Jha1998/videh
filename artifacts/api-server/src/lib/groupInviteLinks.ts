import { randomBytes } from "node:crypto";
import { query } from "./db";

let tablesEnsured = false;

export async function ensureGroupInviteTables(): Promise<void> {
  if (tablesEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS group_invite_links (
      token TEXT PRIMARY KEY,
      chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_group_invite_links_chat
    ON group_invite_links (chat_id)
    WHERE revoked_at IS NULL
  `);
  await query(
    `ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS join_pending_approval BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  tablesEnsured = true;
}

/** standard opaque token (not a numeric group id). */
export function makeGroupInviteToken(): string {
  return randomBytes(16).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 22);
}

export function groupInvitePublicUrl(token: string, siteOrigin = "https://videh.co.in"): string {
  const base = siteOrigin.replace(/\/$/, "");
  return `${base}/join.html?t=${encodeURIComponent(token)}`;
}

export function groupInviteDeepLink(token: string): string {
  return `videh://join-group?token=${encodeURIComponent(token)}`;
}

export async function revokeActiveGroupInviteLinks(chatId: number): Promise<void> {
  await ensureGroupInviteTables();
  await query(
    `UPDATE group_invite_links SET revoked_at = NOW()
     WHERE chat_id = $1 AND revoked_at IS NULL`,
    [chatId],
  );
}

export async function createGroupInviteLink(
  chatId: number,
  createdBy: number,
): Promise<{ token: string; publicUrl: string; deepLink: string }> {
  await ensureGroupInviteTables();
  await revokeActiveGroupInviteLinks(chatId);
  const token = makeGroupInviteToken();
  await query(
    `INSERT INTO group_invite_links (token, chat_id, created_by) VALUES ($1, $2, $3)`,
    [token, chatId, createdBy],
  );
  return {
    token,
    publicUrl: groupInvitePublicUrl(token),
    deepLink: groupInviteDeepLink(token),
  };
}

export async function resolveGroupInviteToken(token: string): Promise<{
  chatId: number;
  groupName: string;
  memberCount: number;
  createdBy: number;
} | null> {
  await ensureGroupInviteTables();
  const r = await query(
    `SELECT gil.chat_id, gil.created_by,
            COALESCE(NULLIF(TRIM(c.group_name), ''), 'Group') AS group_name,
            (SELECT COUNT(*)::int FROM chat_members cm WHERE cm.chat_id = gil.chat_id) AS member_count
     FROM group_invite_links gil
     JOIN chats c ON c.id = gil.chat_id
     WHERE gil.token = $1
       AND gil.revoked_at IS NULL
       AND c.is_group = TRUE`,
    [token],
  );
  const row = r.rows[0] as {
    chat_id: number;
    created_by: number;
    group_name: string;
    member_count: number;
  } | undefined;
  if (!row) return null;
  return {
    chatId: Number(row.chat_id),
    groupName: String(row.group_name),
    memberCount: Number(row.member_count) || 0,
    createdBy: Number(row.created_by),
  };
}

export function canSendAfterInviteApproval(policy: string, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (policy === "admins_only") return false;
  return true;
}
