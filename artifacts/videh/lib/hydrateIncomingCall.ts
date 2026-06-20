import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { fetchIncomingCallDetails } from "@/lib/fetchIncomingCallDetails";
import { isCallCaller } from "@/lib/callRole";

/** Ensure callerId + channel exist before showing incoming UI or accepting. */
export async function hydrateIncomingCallInfo(
  partial: IncomingCallInfo,
  userId: number,
  sessionToken?: string | null,
): Promise<IncomingCallInfo | null> {
  let info = { ...partial };
  const needsHydrate = !info.callerId || info.callerId <= 0 || !info.channel.trim();
  if (needsHydrate) {
    const details = await fetchIncomingCallDetails(info.callId, userId, sessionToken);
    if (!details) return null;
    info = {
      ...info,
      ...details,
      callerName: info.callerName || details.callerName,
    };
  }
  if (!info.callerId || info.callerId <= 0 || !info.channel.trim()) return null;
  return info;
}

/** Hydrate from server and reject if this user is the caller (not the callee). */
export async function hydrateAndValidateIncomingCall(
  partial: IncomingCallInfo,
  userId: number,
  sessionToken?: string | null,
): Promise<IncomingCallInfo | null> {
  const hydrated = await hydrateIncomingCallInfo(partial, userId, sessionToken);
  if (!hydrated) return null;
  if (isCallCaller(userId, hydrated.callerId)) return null;
  return hydrated;
}
