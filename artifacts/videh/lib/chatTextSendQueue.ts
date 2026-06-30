/** Serialize text message POSTs per chat so order is preserved (WhatsApp-style). */
const tailByChat = new Map<string, Promise<void>>();

export function enqueueChatTextSend(chatId: string, task: () => Promise<void>): Promise<void> {
  const key = String(chatId);
  const prev = tailByChat.get(key) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(task);
  tailByChat.set(
    key,
    next.finally(() => {
      if (tailByChat.get(key) === next) tailByChat.delete(key);
    }),
  );
  return next;
}
