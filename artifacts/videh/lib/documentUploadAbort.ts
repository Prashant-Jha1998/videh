const controllers = new Map<string, AbortController>();

export function registerDocumentUpload(messageId: string): AbortController {
  const existing = controllers.get(messageId);
  if (existing) existing.abort();
  const ac = new AbortController();
  controllers.set(messageId, ac);
  return ac;
}

export function clearDocumentUpload(messageId: string): void {
  controllers.delete(messageId);
}

export function cancelDocumentUpload(messageId: string): void {
  controllers.get(messageId)?.abort();
  controllers.delete(messageId);
}
