import { parseCallMessageMeta } from "./callMessage";
import { stripWaveformMeta } from "./webVoiceWaveform";

type DisappearSystemPayload = { kind: "disappear_timer"; seconds: number | null };

export function parseDisappearSystemPayload(text: string): DisappearSystemPayload | null {
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

export function formatDisappearSystemMessage(text: string): string | null {
  const payload = parseDisappearSystemPayload(text);
  if (!payload) return null;
  if (!payload.seconds || payload.seconds <= 0) {
    return "Disappearing messages turned off";
  }
  return `Messages in this chat are now set to disappear after ${disappearDurationPhrase(payload.seconds)}.`;
}

export function isSystemStyleMessage(type: string | undefined, content: string): boolean {
  if ((type ?? "").toLowerCase() === "system") return true;
  return parseDisappearSystemPayload(content) != null;
}

export function formatMessageBody(
  msg: { type: string; content: string; media_url?: string; is_deleted?: boolean },
): string | null {
  if (msg.is_deleted) return "🚫 This message was deleted";

  const type = (msg.type ?? "text").toLowerCase();
  const text = (msg.content ?? "").trim();

  const disappear = formatDisappearSystemMessage(text);
  if (disappear) return disappear;

  if (type === "system") return text || "System message";

  if (parseCallMessageMeta(text) || type === "call") return null;

  if (type === "audio" && msg.media_url) return null;

  if (type === "image" || type === "video") {
    if (!msg.media_url) return text || null;
    const isDefaultLabel = !text || text === "Attachment" || text === "🎥 Video" || text === "📷 Photo";
    const looksLikeFilename = /\.(png|jpe?g|gif|webp|heic|bmp|mp4|mov|webm|mkv)$/i.test(text);
    if (isDefaultLabel || looksLikeFilename) return null;
  }

  if (type === "audio" || text.includes("Voice message") || text.includes("|w:")) {
    if (msg.media_url) return null;
    return stripWaveformMeta(text) || "🎤 Voice message";
  }

  return text;
}
