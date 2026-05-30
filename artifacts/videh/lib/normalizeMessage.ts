import { callMessagePreviewText, parseCallMessageMeta } from "@/lib/callMessage";
import { contactChatPreview } from "@/lib/contactMessage";
import { stripWaveformMeta } from "@/lib/voiceWaveform";
import type { Message } from "@/context/AppContext";

const CONTACT_PREFIX = "__VCONTACT__:";

const DOC_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "ppt", "pptx", "zip", "rar", "7z", "txt",
]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "bmp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "mkv", "m4v"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "wav", "aac", "ogg", "opus"]);

export function extensionFromFilename(filename: string): string {
  const base = (filename ?? "").trim().split(/[?#]/)[0] ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

function extensionFromUrl(url: string): string {
  try {
    const path = new URL(url, "https://videh.local").pathname;
    return extensionFromFilename(path);
  } catch {
    return extensionFromFilename(url);
  }
}

function looksLikeLocationJson(raw: string): boolean {
  if (!raw.startsWith("{")) return false;
  try {
    const j = JSON.parse(raw) as { lat?: number; lng?: number; v?: number };
    return typeof j.lat === "number" && typeof j.lng === "number";
  } catch {
    return false;
  }
}

export function isLikelyDocumentFilename(filename: string): boolean {
  const ext = extensionFromFilename(filename);
  if (!ext) return false;
  if (DOC_EXTENSIONS.has(ext)) return true;
  if (IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)) return false;
  return filename.includes(".");
}

function isLikelyDocumentMediaUrl(mediaUrl: string): boolean {
  const ext = extensionFromUrl(mediaUrl);
  if (!ext) return false;
  return DOC_EXTENSIONS.has(ext);
}

/** Correct message type when DB stored `text` but payload is call JSON, document filename, etc. */
export function normalizeMessageType(
  declared: string | undefined | null,
  content: string,
  mediaUrl?: string | null,
): Message["type"] {
  const declaredType = String(declared ?? "text").toLowerCase();
  if (declaredType === "deleted") return "deleted";

  const raw = (content ?? "").trim();

  if (parseCallMessageMeta(raw)) return "call";

  if (declaredType === "call") return "call";
  if (declaredType === "contact" || raw.startsWith(CONTACT_PREFIX)) return "contact";
  if (declaredType === "location" || looksLikeLocationJson(raw)) return "location";
  if (declaredType === "document") return "document";
  if (declaredType === "image" || declaredType === "video" || declaredType === "audio") {
    return declaredType;
  }

  if (mediaUrl?.trim()) {
    const nameHint = raw || mediaUrl;
    if (isLikelyDocumentFilename(nameHint) || isLikelyDocumentMediaUrl(mediaUrl)) return "document";
    const ext = extensionFromFilename(nameHint) || extensionFromUrl(mediaUrl);
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (VIDEO_EXTENSIONS.has(ext)) return "video";
    if (AUDIO_EXTENSIONS.has(ext)) return "audio";
    if (ext) return "document";
  }

  return declaredType === "text" || !declaredType ? "text" : (declaredType as Message["type"]);
}

/** Chat-list / push preview (never show raw call JSON). */
export function inferChatListPreview(
  declared: string | undefined | null,
  content: string,
  mediaUrl?: string | null,
): string {
  const type = normalizeMessageType(declared, content, mediaUrl);
  const raw = (content ?? "").trim();

  switch (type) {
    case "call":
      return callMessagePreviewText(raw);
    case "image":
      return raw && raw !== "📷 Photo" ? raw : "Photo";
    case "video":
      return raw && raw !== "🎥 Video" ? raw : "Video";
    case "audio": {
      const clean = stripWaveformMeta(raw);
      return clean || "Voice message";
    }
    case "document":
      return raw || "Document";
    case "contact":
      return contactChatPreview(raw);
    case "location":
      return "Location";
    case "deleted":
      return "This message was deleted";
    default:
      return raw.length > 120 ? `${raw.slice(0, 119)}…` : raw || "New message";
  }
}
