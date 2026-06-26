import { interpolate } from "@/lib/i18n";

export const CALL_STATUS_KEYS = {
  calling: "call.status.calling",
  ringing: "call.status.ringing",
  ringingPeople: "call.status.ringingPeople",
  connecting: "call.status.connecting",
  connectingVideo: "call.status.connectingVideo",
  reconnecting: "call.status.reconnecting",
  incomingVideo: "call.status.incomingVideo",
  incomingVoice: "call.status.incomingVoice",
  connectFailed: "call.status.connectFailed",
} as const;

export type CallStatusTranslator = (key: string) => string;

/** Outgoing pre-answer label: voice = ringing at callee, video = calling. */
export function outgoingRingingLabel(t: CallStatusTranslator, isVideo: boolean): string {
  return isVideo ? t(CALL_STATUS_KEYS.calling) : t(CALL_STATUS_KEYS.ringing);
}

export function ringingPeopleLabel(t: CallStatusTranslator, count: number): string {
  return interpolate(t(CALL_STATUS_KEYS.ringingPeople), { n: String(count) });
}

export function incomingCallLabel(t: CallStatusTranslator, isVideo: boolean): string {
  return isVideo ? t(CALL_STATUS_KEYS.incomingVideo) : t(CALL_STATUS_KEYS.incomingVoice);
}

/** Server free-text or i18n key (call.status.*). */
export function resolveCallStatusHint(hint: string | null, t: CallStatusTranslator): string | null {
  if (!hint) return null;
  if (hint.startsWith("call.status.")) return t(hint);
  return hint;
}
