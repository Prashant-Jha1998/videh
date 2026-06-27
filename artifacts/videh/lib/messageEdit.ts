import type { Message } from "@/context/AppContext";

/** WhatsApp-style edit window after send. */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

const NON_EDITABLE_TYPES = new Set([
  "deleted",
  "system",
  "call",
  "audio",
  "document",
  "contact",
  "location",
]);

export function canEditChatMessage(msg: Message, viewerIsSender: boolean): boolean {
  if (!viewerIsSender || msg.isViewOnce || NON_EDITABLE_TYPES.has(msg.type)) return false;
  if (Date.now() - msg.timestamp > MESSAGE_EDIT_WINDOW_MS) return false;
  if (msg.type === "text") return Boolean(msg.text?.trim());
  if (msg.type === "image" || msg.type === "video" || msg.type === "album") {
    const t = msg.text?.trim() ?? "";
    if (!t) return false;
    if (t === "📷 Photo" || t === "📹 Video" || t === "🔁 View once") return false;
    return true;
  }
  return false;
}

export function messageEditWindowRemainingMs(msg: Message): number {
  return Math.max(0, MESSAGE_EDIT_WINDOW_MS - (Date.now() - msg.timestamp));
}
