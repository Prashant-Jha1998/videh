import { parseCallMessageMeta } from "./callMessage";
import { stripWaveformMeta } from "./webVoiceWaveform";

type DisappearSystemPayload = { kind: "disappear_timer"; seconds: number | null };
type PromotedAdminPayload = { kind: "promoted_admin"; targetUserId: number; targetUserName?: string };
type ChatSystemPayload = DisappearSystemPayload | PromotedAdminPayload;

export function parseDisappearSystemPayload(text: string): DisappearSystemPayload | null {
  const p = parseChatSystemPayload(text);
  return p?.kind === "disappear_timer" ? p : null;
}

export function parseChatSystemPayload(text: string): ChatSystemPayload | null {
  const raw = (text ?? "").trim();
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as ChatSystemPayload;
    if (parsed?.kind === "disappear_timer") return parsed;
    if (parsed?.kind === "promoted_admin" && typeof parsed.targetUserId === "number") return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

export function formatPromotedAdminMessage(text: string, viewerUserId?: number): string | null {
  const payload = parseChatSystemPayload(text);
  if (payload?.kind !== "promoted_admin") return null;
  if (viewerUserId != null && viewerUserId === payload.targetUserId) return "You're now an admin";
  const name = payload.targetUserName?.trim();
  return name ? `${name} is now an admin` : "A member is now an admin";
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

  const admin = formatPromotedAdminMessage(text);
  if (admin) return admin;

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

export function replyPreviewText(
  msg: { type: string; content: string; media_url?: string; is_deleted?: boolean },
): string {
  if (msg.is_deleted) return "Message deleted";
  const body = formatMessageBody(msg);
  if (body?.trim()) {
    return body.length > 120 ? `${body.slice(0, 120)}…` : body;
  }
  const type = (msg.type ?? "text").toLowerCase();
  if (type === "image") return "Photo";
  if (type === "video") return "Video";
  if (type === "audio") return "Voice message";
  if (type === "call" || parseCallMessageMeta(msg.content)) return "Call";
  return "Message";
}
