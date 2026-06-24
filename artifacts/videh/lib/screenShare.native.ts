import { Platform } from "react-native";

let screenStream: { getTracks: () => { stop: () => void }[] } | null = null;

export function isScreenShareSupported(): boolean {
  if (Platform.OS === "ios") {
    // iOS needs a ReplayKit broadcast extension; getDisplayMedia is not available in-app.
    return false;
  }
  try {
    const { mediaDevices } = require("react-native-webrtc");
    return typeof mediaDevices?.getDisplayMedia === "function";
  } catch {
    return false;
  }
}

export async function startScreenShare(): Promise<{ getVideoTracks: () => unknown[] } | null> {
  if (!isScreenShareSupported()) return null;
  try {
    const { mediaDevices } = require("react-native-webrtc");
    screenStream = await mediaDevices.getDisplayMedia({ video: true, audio: false });
    return screenStream;
  } catch {
    return null;
  }
}

export async function stopScreenShare(): Promise<void> {
  screenStream?.getTracks().forEach((t) => t.stop());
  screenStream = null;
}
