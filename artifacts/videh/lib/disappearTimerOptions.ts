/** Per-chat timer options — order matches WhatsApp. */
export const CHAT_DISAPPEAR_TIMER_OPTIONS = [
  { label: "24 hours", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
  { label: "90 days", seconds: 7776000 },
  { label: "Off", seconds: null as number | null },
] as const;

export function disappearTimerLabel(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return "Off";
  const hit = CHAT_DISAPPEAR_TIMER_OPTIONS.find((o) => o.seconds === seconds);
  return hit?.label ?? "Custom";
}

export function isSameDisappearTimer(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  const norm = (v: number | null | undefined) => (v == null || v <= 0 ? null : v);
  return norm(a) === norm(b);
}
