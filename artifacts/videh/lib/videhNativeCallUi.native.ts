import { Platform } from "react-native";
import { wakeScreenForIncomingCall } from "@/lib/inCallAudio";

let InCallManager: {
  start: (opts: { media: string; auto?: boolean; ringback?: string }) => void;
  stop: () => void;
  stopRingtone: () => void;
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

/** Wake screen only — ringtone is played via premium call sound (expo-av), not system default. */
export function displayNativeIncomingCall(payload: NativeIncomingCallPayload): void {
  wakeScreenForIncomingCall();
  if (!InCallManager || Platform.OS === "web") return;
  try {
    InCallManager.stopRingtone();
    InCallManager.start({ media: payload.isVideo ? "video" : "audio", auto: false, ringback: "" });
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
