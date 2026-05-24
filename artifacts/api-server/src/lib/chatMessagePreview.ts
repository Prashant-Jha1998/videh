const VOICE_WAVE_PREFIX = "|w:";

function stripVoiceWaveformMeta(content: string): string {
  const idx = content.indexOf(VOICE_WAVE_PREFIX);
  return (idx >= 0 ? content.slice(0, idx) : content).trim();
}

function truncate(text: string, max = 120): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Human-readable preview for push notifications and chat list (no raw waveform data). */
export function chatMessagePushPreview(type: string | undefined, content: string | undefined): string {
  const t = (type ?? "text").toLowerCase();
  const raw = (content ?? "").trim();

  switch (t) {
    case "audio": {
      const clean = stripVoiceWaveformMeta(raw);
      if (clean) return truncate(clean, 80);
      return "🎤 Voice message";
    }
    case "image":
      return raw && raw !== "📷 Photo" ? truncate(raw, 80) : "📷 Photo";
    case "video":
      return raw && raw !== "🎥 Video" ? truncate(raw, 80) : "🎥 Video";
    case "document":
      return raw ? truncate(raw, 80) : "📄 Document";
    case "location":
      return "📍 Location";
    case "contact":
      return raw.startsWith("{") ? "👤 Contact" : truncate(raw, 80) || "👤 Contact";
    case "call":
      return truncate(raw, 80) || "📞 Call";
    case "deleted":
      return "This message was deleted";
    default:
      return truncate(raw, 120) || "New message";
  }
}
