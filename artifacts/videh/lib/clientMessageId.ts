/** Permanent client-side message id (UUID). Never changes after send. */
export function createClientMessageId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isClientMessageUuid(id: string | null | undefined): boolean {
  return Boolean(id && UUID_RE.test(id));
}

/** Legacy optimistic id or permanent client uuid. */
export function isLocalOutgoingMessageId(id: string | null | undefined): boolean {
  if (!id) return false;
  if (id.startsWith("tmp_")) return true;
  return isClientMessageUuid(id);
}
