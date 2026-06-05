export type ChatMessageSignal = {
  chatId: string;
  messageId?: string;
  body?: string;
  senderName?: string;
  senderId?: string;
};

type ChatMessageListener = (signal: ChatMessageSignal) => void;

const listeners = new Set<ChatMessageListener>();

export function onChatMessageSignal(listener: ChatMessageListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitChatMessageSignal(signal: ChatMessageSignal): void {
  for (const listener of listeners) listener(signal);
}
