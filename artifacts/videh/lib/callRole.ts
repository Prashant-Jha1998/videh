/** True when this user should see incoming Accept/Decline UI (they are the callee, not the caller). */
export function shouldPresentIncomingCall(opts: {
  userId: number;
  callerId?: number;
  callId: string;
  activeCall?: { callId?: string; isIncoming?: boolean; engineActive?: boolean; ringing?: boolean } | null;
}): boolean {
  const { userId, callerId, callId, activeCall } = opts;
  if (!callId || !userId) return false;
  if (!callerId || callerId <= 0) return false;
  if (callerId === userId) return false;
  if (activeCall?.callId === callId && activeCall.isIncoming === false) return false;
  if (
    activeCall?.callId === callId
    && activeCall.isIncoming === false
    && (activeCall.engineActive || !activeCall.ringing)
  ) {
    return false;
  }
  return true;
}

export function isCallCaller(userId: number, callerId?: number): boolean {
  return Boolean(callerId && callerId > 0 && callerId === userId);
}

export function isRemotePartyAccepted(
  userId: number,
  acceptedUserIds: number[],
  opts?: { isIncoming?: boolean; engineActive?: boolean; ringing?: boolean; acceptedCount?: number },
): boolean {
  if (opts?.isIncoming) return Boolean(opts.engineActive && !opts.ringing);
  return acceptedUserIds.some((id) => id !== userId);
}
