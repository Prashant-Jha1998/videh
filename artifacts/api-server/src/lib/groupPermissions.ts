import { query } from "./db";

export type GroupPermissions = {
  membersCanEditInfo: boolean;
  membersCanSendMessages: boolean;
  membersCanAddMembers: boolean;
  membersCanShareHistory: boolean;
  membersCanInviteViaLink: boolean;
  approveNewMembers: boolean;
};

let ensured = false;

export async function ensureGroupPermissionColumns(): Promise<void> {
  if (ensured) return;
  await query(
    `ALTER TABLE chats ADD COLUMN IF NOT EXISTS perm_members_edit_info BOOLEAN NOT NULL DEFAULT TRUE`,
  );
  await query(
    `ALTER TABLE chats ADD COLUMN IF NOT EXISTS perm_members_add_members BOOLEAN NOT NULL DEFAULT TRUE`,
  );
  await query(
    `ALTER TABLE chats ADD COLUMN IF NOT EXISTS perm_members_invite_link BOOLEAN NOT NULL DEFAULT TRUE`,
  );
  await query(
    `ALTER TABLE chats ADD COLUMN IF NOT EXISTS perm_members_share_history BOOLEAN NOT NULL DEFAULT TRUE`,
  );
  await query(
    `ALTER TABLE chats ADD COLUMN IF NOT EXISTS perm_approve_new_members BOOLEAN NOT NULL DEFAULT FALSE`,
  );
  ensured = true;
}

type PermRow = {
  is_group: boolean;
  group_name: string | null;
  group_messaging_policy: string | null;
  perm_members_edit_info: boolean;
  perm_members_add_members: boolean;
  perm_members_invite_link: boolean;
  perm_members_share_history: boolean;
  perm_approve_new_members: boolean;
};

function rowToPermissions(row: PermRow): GroupPermissions {
  const policy = String(row.group_messaging_policy || "everyone");
  return {
    membersCanEditInfo: Boolean(row.perm_members_edit_info),
    membersCanSendMessages: policy !== "admins_only",
    membersCanAddMembers: Boolean(row.perm_members_add_members),
    membersCanShareHistory: Boolean(row.perm_members_share_history),
    membersCanInviteViaLink: Boolean(row.perm_members_invite_link),
    approveNewMembers: Boolean(row.perm_approve_new_members),
  };
}

export async function getGroupPermissions(
  chatId: string | number,
): Promise<(GroupPermissions & { groupName: string; isGroup: boolean }) | null> {
  await ensureGroupPermissionColumns();
  const r = await query(
    `SELECT is_group,
            group_name,
            COALESCE(NULLIF(TRIM(group_messaging_policy), ''), 'everyone') AS group_messaging_policy,
            COALESCE(perm_members_edit_info, TRUE) AS perm_members_edit_info,
            COALESCE(perm_members_add_members, TRUE) AS perm_members_add_members,
            COALESCE(perm_members_invite_link, TRUE) AS perm_members_invite_link,
            COALESCE(perm_members_share_history, TRUE) AS perm_members_share_history,
            COALESCE(perm_approve_new_members, FALSE) AS perm_approve_new_members
     FROM chats WHERE id = $1`,
    [chatId],
  );
  const row = r.rows[0] as PermRow | undefined;
  if (!row?.is_group) return null;
  return {
    ...rowToPermissions(row),
    groupName: String(row.group_name ?? "").trim() || "Group",
    isGroup: true,
  };
}

export async function updateGroupPermissions(
  chatId: string | number,
  patch: Partial<GroupPermissions>,
): Promise<GroupPermissions | null> {
  await ensureGroupPermissionColumns();
  const current = await getGroupPermissions(chatId);
  if (!current) return null;

  const next: GroupPermissions = {
    membersCanEditInfo: patch.membersCanEditInfo ?? current.membersCanEditInfo,
    membersCanSendMessages: patch.membersCanSendMessages ?? current.membersCanSendMessages,
    membersCanAddMembers: patch.membersCanAddMembers ?? current.membersCanAddMembers,
    membersCanShareHistory: patch.membersCanShareHistory ?? current.membersCanShareHistory,
    membersCanInviteViaLink: patch.membersCanInviteViaLink ?? current.membersCanInviteViaLink,
    approveNewMembers: patch.approveNewMembers ?? current.approveNewMembers,
  };

  const policyRes = await query(
    `SELECT COALESCE(NULLIF(TRIM(group_messaging_policy), ''), 'everyone') AS policy FROM chats WHERE id = $1`,
    [chatId],
  );
  let messagingPolicy = String(policyRes.rows[0]?.policy || "everyone");

  if (patch.membersCanSendMessages !== undefined) {
    if (!next.membersCanSendMessages) {
      messagingPolicy = "admins_only";
    } else if (messagingPolicy === "admins_only") {
      messagingPolicy = "everyone";
      await query("UPDATE chat_members SET can_send_messages = TRUE WHERE chat_id = $1", [chatId]);
    }
  }

  await query(
    `UPDATE chats SET
       perm_members_edit_info = $2,
       perm_members_add_members = $3,
       perm_members_invite_link = $4,
       perm_members_share_history = $5,
       perm_approve_new_members = $6,
       group_messaging_policy = $7
     WHERE id = $1`,
    [
      chatId,
      next.membersCanEditInfo,
      next.membersCanAddMembers,
      next.membersCanInviteViaLink,
      next.membersCanShareHistory,
      next.approveNewMembers,
      messagingPolicy,
    ],
  );

  return next;
}

export async function getMemberGroupRole(
  chatId: string | number,
  userId: number,
): Promise<{ isMember: boolean; isAdmin: boolean }> {
  const r = await query(
    `SELECT is_admin FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
    [chatId, userId],
  );
  if (!r.rows[0]) return { isMember: false, isAdmin: false };
  return { isMember: true, isAdmin: Boolean(r.rows[0].is_admin) };
}

export async function memberMayEditGroupInfo(chatId: string | number, userId: number): Promise<boolean> {
  const role = await getMemberGroupRole(chatId, userId);
  if (!role.isMember) return false;
  if (role.isAdmin) return true;
  const perms = await getGroupPermissions(chatId);
  return Boolean(perms?.membersCanEditInfo);
}

export async function memberMayAddMembers(chatId: string | number, userId: number): Promise<boolean> {
  const role = await getMemberGroupRole(chatId, userId);
  if (!role.isMember) return false;
  if (role.isAdmin) return true;
  const perms = await getGroupPermissions(chatId);
  return Boolean(perms?.membersCanAddMembers);
}

export async function memberMayInviteViaLink(chatId: string | number, userId: number): Promise<boolean> {
  const role = await getMemberGroupRole(chatId, userId);
  if (!role.isMember) return false;
  if (role.isAdmin) return true;
  const perms = await getGroupPermissions(chatId);
  return Boolean(perms?.membersCanInviteViaLink);
}

export function shouldHidePreJoinHistory(perms: GroupPermissions): boolean {
  return !perms.membersCanShareHistory;
}
