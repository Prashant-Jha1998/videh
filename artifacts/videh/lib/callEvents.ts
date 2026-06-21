export type CallSignalPayload = {
  action?: string;
  callId?: string;
  chatId?: number;
  channel?: string;
  type?: "audio" | "video";
  callerName?: string;
  participantCount?: number;
  callerId?: number;
  acceptedCount?: number;
  acceptedUserIds?: number[];
};

/** Normalize SSE / realtime payloads (fields may be nested under `payload`). */
export function resolveCallSignal(raw: Record<string, unknown>): CallSignalPayload {
  const nested =
    raw.payload && typeof raw.payload === "object"
      ? (raw.payload as Record<string, unknown>)
      : undefined;
  const merged = { ...nested, ...raw };
  const callId = merged.callId ?? merged.call_id;
  const acceptedUserIdsRaw = merged.acceptedUserIds;
  const acceptedUserIds = Array.isArray(acceptedUserIdsRaw)
    ? acceptedUserIdsRaw.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : undefined;
  return {
    action: String(merged.action ?? ""),
    callId: callId != null ? String(callId) : undefined,
    chatId: merged.chatId != null ? Number(merged.chatId) : undefined,
    channel: merged.channel != null ? String(merged.channel) : undefined,
    type: merged.type === "video" ? "video" : "audio",
    callerName: merged.callerName != null ? String(merged.callerName) : undefined,
    participantCount:
      merged.participantCount != null ? Number(merged.participantCount) : undefined,
    callerId: merged.callerId != null ? Number(merged.callerId) : undefined,
    acceptedCount: merged.acceptedCount != null ? Number(merged.acceptedCount) : undefined,
    acceptedUserIds: acceptedUserIds?.length ? acceptedUserIds : undefined,
  };
}

type CallEventListener = (payload: {
  action?: string;
  call?: CallSignalPayload;
  [key: string]: unknown;
}) => void;

const listeners = new Set<CallEventListener>();

export function onCallSignal(listener: CallEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitCallSignal(payload: Parameters<CallEventListener>[0]): void {
  for (const listener of listeners) listener(payload);
}
