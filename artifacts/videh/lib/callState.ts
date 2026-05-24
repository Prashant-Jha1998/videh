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

export function phaseLabel(phase: CallUiPhase, isVideo: boolean): string {
  switch (phase) {
    case "outgoing_ringing":
      return isVideo ? "Video calling…" : "Ringing…";
    case "incoming_ringing":
      return isVideo ? "Incoming video call" : "Incoming voice call";
    case "connecting":
      return "Connecting…";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting…";
    case "failed":
      return "Call failed";
    case "ended":
      return "Call ended";
    default:
      return "";
  }
}
