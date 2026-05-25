import {
  callMessagePreviewText,
  formatCallMessageLabel,
  parseCallMessageMeta,
} from "@/lib/callMessage";
import { contactChatPreview } from "@/lib/contactMessage";
import { stripWaveformMeta } from "@/lib/voiceWaveform";

export type MessageReplyPreviewInput = {
  type?: string;
  text?: string;
  /** "me" when the quoted message was sent by the current user */
  senderId?: string;
  isDeleted?: boolean;
};

/** Human-readable one-line preview for reply composer and quoted strips (no raw JSON). */
export function messageReplyPreviewText(msg: MessageReplyPreviewInput): string {
  if (msg.isDeleted || msg.type === "deleted") return "This message was deleted";

  const type = String(msg.type ?? "text").toLowerCase();
  const content = String(msg.text ?? "").trim();
  const isMe = msg.senderId === "me";

  if (content.startsWith("__VCONTACT__:") || type === "contact") {
    return contactChatPreview(content);
  }

  const callMeta = parseCallMessageMeta(content);
  if (type === "call" || callMeta) {
    if (callMeta) return formatCallMessageLabel(callMeta, isMe);
    return callMessagePreviewText(content);
  }

  if (type === "image") {
    return content && content !== "📷 Photo" && content !== "🔁 View once" ? content : "Photo";
  }
  if (type === "video") {
    return content && content !== "🎥 Video" && content !== "🔁 View once" ? content : "Video";
  }
  if (type === "audio") {
    const clean = stripWaveformMeta(content);
    return clean || "Voice message";
  }
  if (type === "document") {
    return content || "Document";
  }
  if (type === "location") {
    return "Location";
  }
  if (content.length > 120) return `${content.slice(0, 119)}…`;
  return content || "Message";
}

/** Sender line on quoted reply (never show app brand name in 1:1). */
export function replyQuoteSenderLabel(opts: {
  replyQuotedSenderId?: string;
  replySenderName?: string;
  viewerDbId?: number | string | null;
  chatContactName?: string;
  isGroup?: boolean;
}): string {
  if (
    opts.replyQuotedSenderId
    && opts.viewerDbId != null
    && String(opts.replyQuotedSenderId) === String(opts.viewerDbId)
  ) {
    return "You";
  }
  const raw = opts.replySenderName?.trim();
  const contact = opts.chatContactName?.trim();
  if (raw) {
    const lower = raw.toLowerCase();
    if (!opts.isGroup && contact && (lower === "videh" || lower === "unknown")) {
      return contact;
    }
    return raw;
  }
  return contact || "Contact";
}
