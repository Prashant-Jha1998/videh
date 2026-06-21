import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { getApiUrl } from "@/lib/api";
import { webrtcAuthHeaders } from "@/lib/webrtcApi";

const TERMINAL_STATUSES = new Set(["missed", "declined", "ended", "busy"]);

/** Load channel/chatId/type for a ringing call (CallKeep answer, notification tap). */
export async function fetchIncomingCallDetails(
  callId: string,
  userId: number,
  sessionToken?: string | null,
  opts?: { requireRinging?: boolean },
): Promise<IncomingCallInfo | null> {
  if (!callId || !userId) return null;
  const requireRinging = opts?.requireRinging === true;
  try {
    const res = await fetch(
      `${getApiUrl()}/api/webrtc/calls/${encodeURIComponent(callId)}/status?userId=${userId}`,
      { headers: webrtcAuthHeaders(sessionToken) },
    );
    const data = (await res.json()) as {
      success?: boolean;
      ended?: boolean;
      call?: {
        callId?: string;
        channel?: string;
        chatId?: number;
        type?: string;
        callerName?: string;
        callerId?: number;
        participantCount?: number;
        status?: string | null;
      };
      callerId?: number;
    };
    if (!data.success || data.ended || !data.call?.channel) return null;
    const calleeStatus = data.call.status ?? null;
    if (calleeStatus && TERMINAL_STATUSES.has(calleeStatus)) return null;
    if (requireRinging && calleeStatus && calleeStatus !== "ringing") return null;
    const resolvedCallerId = Number(data.callerId ?? data.call.callerId);
    return {
      callId: String(data.call.callId ?? callId),
      channel: String(data.call.channel),
      chatId: Number(data.call.chatId),
      type: data.call.type === "video" ? "video" : "audio",
      callerName: String(data.call.callerName ?? "Videh user"),
      participantCount: Number(data.call.participantCount ?? 2),
      callerId: Number.isFinite(resolvedCallerId) && resolvedCallerId > 0 ? resolvedCallerId : undefined,
    };
  } catch {
    return null;
  }
}
