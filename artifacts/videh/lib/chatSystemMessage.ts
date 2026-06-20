export type DisappearSystemPayload = {
  kind: "disappear_timer";
  seconds: number | null;
};

export type PromotedAdminPayload = {
  kind: "promoted_admin";
  targetUserId: number;
  targetUserName?: string;
};

export type ChatSystemPayload = DisappearSystemPayload | PromotedAdminPayload;

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

/** @deprecated use parseChatSystemPayload */
export function parseDisappearSystemPayload(text: string): DisappearSystemPayload | null {
  const p = parseChatSystemPayload(text);
  return p?.kind === "disappear_timer" ? p : null;
}

export function disappearDurationPhrase(seconds: number): string {
  if (seconds === 86400) return "24 hours";
  if (seconds === 604800) return "7 days";
  if (seconds === 7776000) return "90 days";
  return "a set time";
}

export function disappearSystemMessageCopy(seconds: number | null): {
  body: string;
  showChangeLink: boolean;
} {
  if (!seconds || seconds <= 0) {
    return { body: "You turned off disappearing messages.", showChangeLink: false };
  }
  const duration = disappearDurationPhrase(seconds);
  return {
    body: `The message timer was updated. New messages will disappear from this chat ${duration} after they're sent, except when kept.`,
    showChangeLink: true,
  };
}

export function isDisappearTimerSystemMessage(text: string): boolean {
  return parseDisappearSystemPayload(text) != null;
}

export function promotedAdminMessageCopy(
  payload: PromotedAdminPayload,
  viewerUserId?: number,
): string {
  if (viewerUserId != null && viewerUserId === payload.targetUserId) {
    return "You're now an admin";
  }
  const name = payload.targetUserName?.trim();
  return name ? `${name} is now an admin` : "A member is now an admin";
}
