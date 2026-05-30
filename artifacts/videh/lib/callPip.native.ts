import { NativeModules, Platform } from "react-native";

/**
 * Enable system PiP when user presses Home during a video call (Android 8+).
 */
export function setVideoCallPipEnabled(enabled: boolean): void {
  if (Platform.OS !== "android") return;
  try {
    const mod = NativeModules.VidehPip as { setEnabled?: (v: boolean) => void } | undefined;
    mod?.setEnabled?.(enabled);
  } catch {
    /* native module available after prebuild */
  }
}

export function isVideoCallPipSupported(): boolean {
  return Platform.OS === "android" && Number(Platform.Version) >= 26;
}
