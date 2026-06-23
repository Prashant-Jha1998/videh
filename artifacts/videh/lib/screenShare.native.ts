import { Platform } from "react-native";

let screenStream: { getTracks?: () => Array<{ stop: () => void }> } | null = null;

export function isScreenShareSupported(): boolean {
  return Platform.OS === "android" || Platform.OS === "ios";
}

export async function startScreenShare(): Promise<{
  getVideoTracks: () => Array<{ kind?: string; onended?: (() => void) | null }>;
  toURL?: () => string;
} | null> {
  if (!isScreenShareSupported()) return null;
  try {
    const { mediaDevices } = require("react-native-webrtc");
    screenStream = await mediaDevices.getDisplayMedia();
    return screenStream;
  } catch {
    screenStream = null;
    return null;
  }
}

export async function stopScreenShare(): Promise<void> {
  screenStream?.getTracks?.().forEach((t) => t.stop());
  screenStream = null;
}
