export type DisappearSystemPayload = {
  kind: "disappear_timer";
  seconds: number | null;
};

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
