export type CallSignalPayload = {
  action?: string;
  callId?: string;
  chatId?: number;
  channel?: string;
  type?: "audio" | "video";
  callerName?: string;
  participantCount?: number;
  callerId?: number;
};

/** Normalize SSE / realtime payloads (fields may be nested under `payload`). */
export function resolveCallSignal(raw: Record<string, unknown>): CallSignalPayload {
  const nested =
    raw.payload && typeof raw.payload === "object"
      ? (raw.payload as Record<string, unknown>)
      : undefined;
  const merged = { ...nested, ...raw };
  const callId = merged.callId ?? merged.call_id;
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
