export type CallMessageMeta = {
  callType: "audio" | "video";
  result: "answered" | "missed" | "declined" | "busy" | "unavailable";
  durationSeconds?: number;
};

export function parseCallMessageMeta(raw: string): CallMessageMeta | null {
  try {
    const parsed = JSON.parse(raw) as CallMessageMeta;
    if (!parsed?.callType || !parsed?.result) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatCallMessageLabel(meta: CallMessageMeta, isMe: boolean): string {
  if (meta.result === "answered") {
    const total = Math.max(0, meta.durationSeconds ?? 0);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    const dur = `${mins}:${String(secs).padStart(2, "0")}`;
    return meta.callType === "video" ? `Video call · ${dur}` : `Voice call · ${dur}`;
  }
  if (meta.result === "declined") {
    return meta.callType === "video" ? "Declined video call" : "Declined voice call";
  }
  if (meta.result === "busy") {
    return meta.callType === "video" ? "Busy on another video call" : "Line busy";
  }
  if (meta.result === "unavailable") {
    return isMe
      ? meta.callType === "video"
        ? "Video call unavailable"
        : "Couldn't place call"
      : meta.callType === "video"
        ? "Missed video call"
        : "Missed voice call";
  }
  if (isMe) {
    return meta.callType === "video" ? "Unanswered video call" : "Unanswered voice call";
  }
  return meta.callType === "video" ? "Missed video call" : "Missed voice call";
}

export function callMessagePreviewText(content: string): string {
  const meta = parseCallMessageMeta(content);
  if (!meta) return "Call";
  return formatCallMessageLabel(meta, false);
}
