export type ChatMessageSignal = {
  chatId: string;
  messageId?: string;
  body?: string;
  senderName?: string;
  senderId?: string;
  messageType?:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "document"
    | "album"
    | "location"
    | "contact"
    | "call"
    | "deleted"
    | "system";
  mediaUrl?: string;
};

type ChatMessageListener = (signal: ChatMessageSignal) => void;

const listeners = new Set<ChatMessageListener>();
const recentSignalAt = new Map<string, number>();
const SIGNAL_DEDUPE_MS = 10_000;

function signalDedupeKey(signal: ChatMessageSignal): string {
  return [
    signal.chatId,
    signal.messageId ?? "",
    signal.senderId ?? "",
    signal.body?.trim() ?? "",
    signal.messageType ?? "",
    signal.mediaUrl?.trim() ?? "",
  ].join("|");
}

export function onChatMessageSignal(listener: ChatMessageListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitChatMessageSignal(signal: ChatMessageSignal): void {
  const key = signalDedupeKey(signal);
  const now = Date.now();
  const prev = recentSignalAt.get(key);
  if (prev != null && now - prev < SIGNAL_DEDUPE_MS) return;
  recentSignalAt.set(key, now);
  if (recentSignalAt.size > 200) {
    for (const [k, at] of recentSignalAt) {
      if (now - at > SIGNAL_DEDUPE_MS) recentSignalAt.delete(k);
    }
  }
  for (const listener of listeners) listener(signal);
}
