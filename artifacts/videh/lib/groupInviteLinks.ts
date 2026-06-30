import { getApiUrl } from "@/lib/api";

export type GroupInvitePreview = {
  token: string;
  groupName: string;
  memberCount: number;
};

export async function createGroupInviteLink(
  chatId: string,
  requesterId: number,
  sessionToken?: string | null,
): Promise<{ token: string; publicUrl: string; deepLink: string; groupName: string } | null> {
  const res = await fetch(`${getApiUrl()}/api/chats/${encodeURIComponent(chatId)}/invite-link`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify({ requesterId }),
  });
  const data = await res.json() as {
    success?: boolean;
    invite?: { token: string; publicUrl: string; deepLink: string; groupName: string };
  };
  if (!data.success || !data.invite) return null;
  return data.invite;
}

export async function resolveGroupInvite(
  token: string,
): Promise<GroupInvitePreview | null> {
  const res = await fetch(`${getApiUrl()}/api/group-invites/${encodeURIComponent(token)}`);
  const data = await res.json() as {
    success?: boolean;
    invite?: { token: string; groupName: string; memberCount: number };
  };
  if (!data.success || !data.invite) return null;
  return data.invite;
}

export async function joinGroupViaInvite(
  token: string,
  sessionToken: string | null | undefined,
): Promise<{
  chatId: string;
  groupName: string;
  pendingApproval: boolean;
  canSendMessages: boolean;
  alreadyMember: boolean;
  message?: string;
} | null> {
  const res = await fetch(`${getApiUrl()}/api/group-invites/${encodeURIComponent(token)}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
  });
  const data = await res.json() as {
    success?: boolean;
    chatId?: number;
    groupName?: string;
    pendingApproval?: boolean;
    canSendMessages?: boolean;
    alreadyMember?: boolean;
    message?: string;
  };
  if (!data.success || data.chatId == null) return null;
  return {
    chatId: String(data.chatId),
    groupName: data.groupName ?? "Group",
    pendingApproval: Boolean(data.pendingApproval),
    canSendMessages: Boolean(data.canSendMessages),
    alreadyMember: Boolean(data.alreadyMember),
    message: data.message,
  };
}

export async function approvePendingGroupJoin(
  chatId: string,
  memberId: number,
  requesterId: number,
  sessionToken?: string | null,
): Promise<boolean> {
  const res = await fetch(
    `${getApiUrl()}/api/chats/${encodeURIComponent(chatId)}/pending-joins/${memberId}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ requesterId }),
    },
  );
  const data = await res.json() as { success?: boolean };
  return Boolean(data.success);
}

export async function rejectPendingGroupJoin(
  chatId: string,
  memberId: number,
  requesterId: number,
  sessionToken?: string | null,
): Promise<boolean> {
  const res = await fetch(
    `${getApiUrl()}/api/chats/${encodeURIComponent(chatId)}/pending-joins/${memberId}/reject`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      },
      body: JSON.stringify({ requesterId }),
    },
  );
  const data = await res.json() as { success?: boolean };
  return Boolean(data.success);
}

/** Parse token from videh://join-group?token=… or https://videh.co.in/join/TOKEN */
export function parseGroupInviteTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url.replace(/^videh:\/\//, "https://videh.app/"));
    const qp = parsed.searchParams.get("token") ?? parsed.searchParams.get("t");
    if (qp?.trim()) return qp.trim();
    const parts = parsed.pathname.split("/").filter(Boolean);
    const joinIdx = parts.findIndex((p) => p === "join");
    if (joinIdx >= 0 && parts[joinIdx + 1]) return parts[joinIdx + 1]!;
    if (parts[0] === "join-group" && parts[1]) return parts[1];
  } catch {
    /* ignore */
  }
  return null;
}
