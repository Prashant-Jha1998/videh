import { getApiUrl } from "@/lib/api";

export async function createCallLink(
  sessionToken: string | null | undefined,
  opts?: { chatId?: number; type?: "audio" | "video"; title?: string; hoursValid?: number },
): Promise<{ token: string; deepLink: string; webPath?: string; callType: string } | null> {
  const res = await fetch(`${getApiUrl()}/api/call-links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify({
      chatId: opts?.chatId,
      type: opts?.type ?? "video",
      title: opts?.title,
      hoursValid: opts?.hoursValid ?? 24,
    }),
  });
  const data = (await res.json()) as {
    success?: boolean;
    link?: { token: string; deepLink: string; webPath?: string; callType: string };
  };
  if (!data.success || !data.link) return null;
  return data.link;
}

export async function resolveCallLink(
  token: string,
  sessionToken?: string | null,
): Promise<{
  hostName: string;
  callType: string;
  chatId?: number;
  hostUserId: number;
} | null> {
  const res = await fetch(`${getApiUrl()}/api/call-links/${encodeURIComponent(token)}`, {
    headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
  });
  const data = (await res.json()) as {
    success?: boolean;
    link?: { hostName: string; callType: string; chatId?: number; hostUserId: number };
  };
  if (!data.success || !data.link) return null;
  return data.link;
}

export type JoinCallLinkResult = {
  chatId: number;
  callType: string;
  hostUserId?: number;
  liveCall?: {
    callId: string;
    channel: string;
    callerId: number;
    alreadyOnCall?: boolean;
  } | null;
  startOutgoing?: boolean;
};

export async function joinCallLink(
  token: string,
  sessionToken: string | null | undefined,
): Promise<JoinCallLinkResult | null> {
  const res = await fetch(`${getApiUrl()}/api/call-links/${encodeURIComponent(token)}/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
  });
  const data = (await res.json()) as {
    success?: boolean;
    chatId?: number;
    callType?: string;
    hostUserId?: number;
    liveCall?: JoinCallLinkResult["liveCall"];
    startOutgoing?: boolean;
  };
  if (!data.success || data.chatId == null) return null;
  return {
    chatId: Number(data.chatId),
    callType: data.callType ?? "video",
    hostUserId: data.hostUserId,
    liveCall: data.liveCall ?? null,
    startOutgoing: data.startOutgoing,
  };
}
