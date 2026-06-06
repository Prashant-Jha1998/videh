/** WhatsApp allows very long text messages (~64k chars). */
export const CHAT_MESSAGE_MAX_CHARS = 65536;

/** Collapse long bubbles with "Read more" (WhatsApp-style). */
export const READ_MORE_COLLAPSE_CHARS = 600;
export const READ_MORE_COLLAPSE_LINES = 18;

export function shouldCollapseChatMessage(text: string): boolean {
  const t = text ?? "";
  return t.length > READ_MORE_COLLAPSE_CHARS || t.split("\n").length > READ_MORE_COLLAPSE_LINES;
}

export function getCollapsedChatMessagePreview(text: string): string {
  const lines = text.split("\n");
  let out =
    lines.length > READ_MORE_COLLAPSE_LINES
      ? lines.slice(0, READ_MORE_COLLAPSE_LINES).join("\n")
      : text;

  if (out.length > READ_MORE_COLLAPSE_CHARS) {
    const slice = out.slice(0, READ_MORE_COLLAPSE_CHARS);
    const lastSpace = slice.lastIndexOf(" ");
    out = (lastSpace > READ_MORE_COLLAPSE_CHARS * 0.55 ? slice.slice(0, lastSpace) : slice).trimEnd();
  }
  return out;
}
