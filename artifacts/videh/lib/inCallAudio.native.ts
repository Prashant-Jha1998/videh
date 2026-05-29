import { Platform } from "react-native";

let InCallManager: {
  start: (opts: { media: string }) => void;
  stop: () => void;
  setKeepScreenOn: (on: boolean) => void;
  setSpeakerphoneOn: (on: boolean) => void;
  setForceSpeakerphoneOn: (on: boolean) => void;
  turnScreenOff: () => void;
  turnScreenOn: () => void;
} | null = null;

try {
  InCallManager = require("react-native-incall-manager").default;
} catch {
  InCallManager = null;
}

export function isInCallManagerAvailable(): boolean {
  return Platform.OS !== "web" && InCallManager != null;
}

/** Wake display for incoming call (lock screen / screen off). */
export function wakeScreenForIncomingCall(): void {
  if (!InCallManager || Platform.OS === "web") return;
  try {
    InCallManager.turnScreenOn();
    InCallManager.setKeepScreenOn(true);
  } catch {
    /* ignore */
  }
}

export async function startInCallSession(isVideo: boolean): Promise<void> {
  if (!InCallManager) return;
  InCallManager.start({ media: isVideo ? "video" : "audio" });
  InCallManager.setKeepScreenOn(true);
  InCallManager.setSpeakerphoneOn(isVideo);
  InCallManager.setForceSpeakerphoneOn(isVideo);
}

export async function stopInCallSession(): Promise<void> {
  if (!InCallManager) return;
  InCallManager.setKeepScreenOn(false);
  InCallManager.setSpeakerphoneOn(false);
  InCallManager.setForceSpeakerphoneOn(false);
  InCallManager.stop();
}

export function applySpeakerRoute(enabled: boolean, isVideo: boolean): void {
  if (!InCallManager) return;
  const on = enabled || isVideo;
  InCallManager.setSpeakerphoneOn(on);
  InCallManager.setForceSpeakerphoneOn(on);
}

export function setProximityScreenOff(enabled: boolean): void {
  if (!InCallManager || Platform.OS === "android") return;
  if (enabled) InCallManager.turnScreenOff();
  else InCallManager.turnScreenOn();
}

/** Loudspeaker for voice notes (earpiece was too quiet for recipients). */
export function startVoiceNotePlaybackSession(): void {
  if (!InCallManager) return;
  InCallManager.start({ media: "audio" });
  InCallManager.setSpeakerphoneOn(true);
  InCallManager.setForceSpeakerphoneOn(true);
}

export function stopVoiceNotePlaybackSession(): void {
  if (!InCallManager) return;
  InCallManager.setSpeakerphoneOn(false);
  InCallManager.setForceSpeakerphoneOn(false);
  InCallManager.stop();
}
