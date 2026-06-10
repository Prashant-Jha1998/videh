import { callMessagePreview, type CallMessageMeta } from "./callMessages";

const VOICE_WAVE_PREFIX = "|w:";
const CONTACT_MSG_PREFIX = "__VCONTACT__:";

function parseCallMessageContent(raw: string): CallMessageMeta | null {
  try {
    const parsed = JSON.parse(raw) as CallMessageMeta;
    if (!parsed?.callType || !parsed?.result) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stripVoiceWaveformMeta(content: string): string {
  const idx = content.indexOf(VOICE_WAVE_PREFIX);
  return (idx >= 0 ? content.slice(0, idx) : content).trim();
}

function truncate(text: string, max = 120): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function contactPushPreview(raw: string): string {
  if (raw.startsWith(CONTACT_MSG_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(CONTACT_MSG_PREFIX.length)) as { name?: string };
      const name = (parsed?.name ?? "Contact").trim() || "Contact";
      return `Contact · ${name}`;
    } catch {
      return "Contact";
    }
  }
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { name?: string };
      if (parsed?.name) return `Contact · ${String(parsed.name).trim()}`;
    } catch {
      /* ignore */
    }
  }
  const firstLine = raw.split("\n").map((l) => l.trim()).find(Boolean);
  if (firstLine?.startsWith("👤")) return truncate(firstLine.replace(/^👤\s*/, "Contact · "), 80);
  return "Contact";
}

function locationPushPreview(raw: string): string {
  if (!raw.startsWith("{")) return "Location";
  try {
    const j = JSON.parse(raw) as { mode?: string; label?: string; v?: number };
    if (j?.v === 1 && j.mode === "live") {
      return j.label ? `Live location · ${truncate(j.label, 48)}` : "Live location";
    }
    if (j?.v === 1 && j.label) return `Location · ${truncate(j.label, 56)}`;
  } catch {
    /* ignore */
  }
  return "Location";
}

/** Detect internal payloads when message `type` was stored incorrectly as text. */
function previewFromRawContent(raw: string): string | null {
  if (raw.startsWith(CONTACT_MSG_PREFIX)) return contactPushPreview(raw);
  const callMeta = parseCallMessageContent(raw);
  if (callMeta) return callMessagePreview(callMeta);
  if (raw.startsWith("{") && raw.includes('"lat"') && raw.includes('"lng"')) {
    return locationPushPreview(raw);
  }
  return null;
}

/** Human-readable preview for push notifications and chat list (no raw internal payloads). */
export function chatMessagePushPreview(type: string | undefined, content: string | undefined): string {
  const t = (type ?? "text").toLowerCase();
  const raw = (content ?? "").trim();

  switch (t) {
    case "audio": {
      const clean = stripVoiceWaveformMeta(raw);
      if (clean) return truncate(clean, 80);
      return "Voice message";
    }
    case "album": {
      try {
        const album = JSON.parse(raw) as { urls?: unknown[]; caption?: string };
        if (Array.isArray(album.urls) && album.urls.length > 1) {
          if (album.caption?.trim()) return truncate(album.caption.trim(), 80);
          return `${album.urls.length} photos`;
        }
      } catch {
        /* fall through */
      }
      return "Album";
    }
    case "image":
      return raw && raw !== "📷 Photo" ? truncate(raw, 80) : "Photo";
    case "video":
      return raw && raw !== "🎥 Video" ? truncate(raw, 80) : "Video";
    case "document":
      return raw ? truncate(raw, 80) : "Document";
    case "location":
      return locationPushPreview(raw);
    case "contact":
      return contactPushPreview(raw);
    case "call": {
      const meta = parseCallMessageContent(raw);
      if (meta) return callMessagePreview(meta);
      return "Call";
    }
    case "deleted":
      return "This message was deleted";
    default: {
      const inferred = previewFromRawContent(raw);
      if (inferred) return inferred;
      return truncate(raw, 120) || "New message";
    }
  }
}
