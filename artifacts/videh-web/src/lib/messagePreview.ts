import { callMessagePreviewText, parseCallMessageMeta } from "./callMessage";
import { stripWaveformMeta } from "./webVoiceWaveform";

const DOC_PAYLOAD_PREFIX = "\u2063doc:";
const CONTACT_PREFIX = "__VCONTACT__:";

function parseDocumentPayload(text: string): { filename: string; caption?: string } {
  const raw = (text ?? "").trim();
  let jsonPart = "";
  if (raw.startsWith(DOC_PAYLOAD_PREFIX)) {
    jsonPart = raw.slice(DOC_PAYLOAD_PREFIX.length);
  } else if (/^doc:\s*\{/i.test(raw)) {
    jsonPart = raw.replace(/^doc:\s*/i, "");
  } else {
    return { filename: raw || "Document" };
  }
  try {
    const parsed = JSON.parse(jsonPart) as { filename?: string; caption?: string };
    return {
      filename: parsed.filename?.trim() || "Document",
      caption: parsed.caption?.trim() || undefined,
    };
  } catch {
    return { filename: "Document" };
  }
}

function isDocumentPayload(text: string): boolean {
  const raw = (text ?? "").trim();
  return raw.startsWith(DOC_PAYLOAD_PREFIX) || /^doc:\s*\{/i.test(raw);
}

function documentChatPreview(text: string): string {
  const parsed = parseDocumentPayload(text);
  if (parsed.caption) return parsed.caption;
  const name = parsed.filename?.trim();
  if (name && name !== "Document") return `📄 ${name}`;
  return "📄 Document";
}

type DisappearSystemPayload = { kind: "disappear_timer"; seconds: number | null };

function parseDisappearSystemPayload(text: string): DisappearSystemPayload | null {
  const raw = (text ?? "").trim();
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as DisappearSystemPayload;
    if (parsed?.kind === "disappear_timer") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function disappearDurationPhrase(seconds: number): string {
  if (seconds === 86400) return "24 hours";
  if (seconds === 604800) return "7 days";
  if (seconds === 7776000) return "90 days";
  return "a set time";
}

function disappearListPreview(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "Disappearing messages turned off";
  const duration = disappearDurationPhrase(seconds);
  return `Timer updated · messages disappear in ${duration}`;
}

function contactChatPreview(text: string): string {
  if (!text.startsWith(CONTACT_PREFIX)) return "Contact";
  try {
    const parsed = JSON.parse(text.slice(CONTACT_PREFIX.length)) as { name?: string };
    const name = parsed.name?.trim();
    return name ? `👤 ${name}` : "Contact";
  } catch {
    return "Contact";
  }
}

function voiceListPreview(text: string): string {
  const clean = stripWaveformMeta(text).trim();
  if (!clean) return "Voice message";
  if (/voice message/i.test(clean) || clean.includes("🎤")) return clean;
  return "Voice message";
}

function isVoiceNoteContent(text: string, type: string): boolean {
  const declared = type.toLowerCase();
  if (declared === "audio" || declared === "voice") return true;
  const t = text.trim();
  return t.includes("|w:") || /voice message/i.test(t);
}

function looksLikeLocationJson(raw: string): boolean {
  if (!raw.startsWith("{")) return false;
  try {
    const j = JSON.parse(raw) as { lat?: number; lng?: number };
    return typeof j.lat === "number" && typeof j.lng === "number";
  } catch {
    return false;
  }
}

export function inferListPreview(
  type: string | undefined,
  content: string,
  isDeleted?: boolean,
  mediaUrl?: string,
): string {
  if (isDeleted) return "This message was deleted";

  const declared = (type ?? "text").toLowerCase();
  const text = (content ?? "").trim();

  if (declared === "system") {
    const disappear = parseDisappearSystemPayload(text);
    if (disappear) return disappearListPreview(disappear.seconds);
    return "System message";
  }

  const disappear = parseDisappearSystemPayload(text);
  if (disappear) return disappearListPreview(disappear.seconds);

  if (parseCallMessageMeta(text) || declared === "call") {
    return callMessagePreviewText(text);
  }

  if (declared === "document" || isDocumentPayload(text)) {
    return documentChatPreview(text);
  }

  if (declared === "contact" || text.startsWith(CONTACT_PREFIX)) {
    return contactChatPreview(text);
  }

  if (declared === "image") {
    return text && text !== "Attachment" && text !== "📷 Photo" ? text : "Photo";
  }
  if (declared === "video") {
    return text && text !== "🎥 Video" ? text : "Video";
  }
  if (declared === "audio" || declared === "voice") {
    return voiceListPreview(text);
  }
  if (isVoiceNoteContent(text, declared)) {
    return voiceListPreview(text);
  }
  if (declared === "location" || looksLikeLocationJson(text)) {
    try {
      const j = JSON.parse(text) as { mode?: string; stopped?: boolean; until?: number; v?: number };
      if (j?.v === 1 && j.mode === "live") {
        const ended = j.stopped || (typeof j.until === "number" && j.until <= Date.now());
        return ended ? "📍 Live location ended" : "📍 Shared live location";
      }
    } catch {
      /* ignore */
    }
    return "📍 Shared a location";
  }

  if (mediaUrl?.trim()) {
    const ext = mediaUrl.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase() ?? "";
    if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "txt", "csv"].includes(ext)) {
      return documentChatPreview(text || mediaUrl.split("/").pop() || "Document");
    }
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "Photo";
    if (["mp4", "mov", "webm", "mkv"].includes(ext)) return "Video";
    if (["mp3", "m4a", "wav", "aac", "ogg"].includes(ext)) return "Voice message";
  }

  if (isDocumentPayload(text)) return documentChatPreview(text);

  return text.length > 120 ? `${text.slice(0, 119)}…` : text || "Message";
}
