import { Platform } from "react-native";
import { wakeScreenForIncomingCall } from "@/lib/inCallAudio";

let InCallManager: {
  start: (opts: { media: string; auto?: boolean; ringback?: string }) => void;
  stop: () => void;
  startRingtone: (ringtone: string, ringtoneCategory: string, seconds: number, type: string) => void;
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

/**
 * WhatsApp-style: wake screen + in-call audio session while ringing.
 * Full CallKit/ConnectionService requires a native build with react-native-callkeep.
 */
export function displayNativeIncomingCall(payload: NativeIncomingCallPayload): void {
  wakeScreenForIncomingCall();
  if (!InCallManager || Platform.OS === "web") return;
  try {
    InCallManager.start({ media: payload.isVideo ? "video" : "audio", auto: false, ringback: "" });
    (InCallManager as { startRingtone?: (...args: unknown[]) => void }).startRingtone?.(
      "_DEFAULT_",
      [0, 1000, 500, 1000],
      "playback",
      45,
    );
  } catch {
    /* ignore */
  }
}

export function dismissNativeIncomingCall(): void {
  if (!InCallManager || Platform.OS === "web") return;
  try {
    InCallManager.stopRingtone();
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
