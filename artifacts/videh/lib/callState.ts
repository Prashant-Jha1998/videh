import type { CallStatusTranslator } from "@/lib/callStatusLabels";
import {
  CALL_STATUS_KEYS,
  incomingCallLabel,
  outgoingRingingLabel,
} from "@/lib/callStatusLabels";

/** UI phases for 1:1 / group calls (inspired by Telegram VoIPServiceState). */
export type CallUiPhase =
  | "idle"
  | "outgoing_ringing"
  | "incoming_ringing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended"
  | "failed";

export function phaseLabel(
  phase: CallUiPhase,
  isVideo: boolean,
  t?: CallStatusTranslator,
): string {
  const tr = t ?? ((key) => key);
  switch (phase) {
    case "outgoing_ringing":
      return outgoingRingingLabel(tr, isVideo);
    case "incoming_ringing":
      return incomingCallLabel(tr, isVideo);
    case "connecting":
      return tr(CALL_STATUS_KEYS.connecting);
    case "connected":
      return tr("call.status.connected");
    case "reconnecting":
      return tr(CALL_STATUS_KEYS.reconnecting);
    case "failed":
      return tr("call.status.failed");
    case "ended":
      return tr("call.status.ended");
    default:
      return "";
  }
}
