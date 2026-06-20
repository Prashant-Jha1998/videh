import { Platform } from "react-native";
import { wakeScreenForIncomingCall } from "@/lib/inCallAudio";

let InCallManager: {
  start: (opts: { media: string; auto?: boolean; ringback?: string }) => void;
  stop: () => void;
  stopRingtone: () => void;
  startRingtone: (ringtone: string, vibratePattern?: number[]) => void;
} | null = null;

try {
  InCallManager = require("react-native-incall-manager").default;
} catch {
  InCallManager = null;
}

export type NativeIncomingCallPayload = {
  callId: string;
  callerName: string;
  isVideo: boolean;
};

/** Wake screen + native ringtone (works when JS is backgrounded; notification channel backs this up). */
export function displayNativeIncomingCall(_payload: NativeIncomingCallPayload): void {
  wakeScreenForIncomingCall();
  if (!InCallManager || Platform.OS === "web") return;
  try {
    InCallManager.stopRingtone();
    InCallManager.startRingtone("_DEFAULT_", [1000, 500, 1000, 500]);
  } catch {
    /* ignore */
  }
}

export function dismissNativeIncomingCall(): void {
  if (!InCallManager || Platform.OS === "web") return;
  try {
    InCallManager.stopRingtone();
    InCallManager.stop();
  } catch {
    /* ignore */
  }
}

export function startNativeOngoingCallSession(isVideo: boolean): void {
  if (!InCallManager || Platform.OS === "web") return;
  try {
    InCallManager.stopRingtone();
    InCallManager.start({ media: isVideo ? "video" : "audio" });
  } catch {
    /* ignore */
  }
}
