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
