import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();

export type GroupPermissions = {
  membersCanEditInfo: boolean;
  membersCanSendMessages: boolean;
  membersCanAddMembers: boolean;
  membersCanShareHistory: boolean;
  membersCanInviteViaLink: boolean;
  approveNewMembers: boolean;
};

export type GroupPermissionsResponse = {
  groupName: string;
  isAdmin: boolean;
  permissions: GroupPermissions;
};

export async function fetchGroupPermissions(
  chatId: string,
  requesterId: number,
  sessionToken?: string | null,
): Promise<GroupPermissionsResponse | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/api/chats/${chatId}/group-permissions?requesterId=${requesterId}`,
      {
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
      },
    );
    const data = await res.json();
    if (!data.success) return null;
    return {
      groupName: data.groupName ?? "Group",
      isAdmin: Boolean(data.isAdmin),
      permissions: data.permissions,
    };
  } catch {
    return null;
  }
}

export async function updateGroupPermissions(
  chatId: string,
  requesterId: number,
  permissions: Partial<GroupPermissions>,
  sessionToken?: string | null,
): Promise<GroupPermissions | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/chats/${chatId}/group-permissions`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ requesterId, permissions }),
    });
    const data = await res.json();
    if (!data.success) return null;
    return data.permissions ?? null;
  } catch {
    return null;
  }
}
