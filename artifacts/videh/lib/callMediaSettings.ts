import AsyncStorage from "@react-native-async-storage/async-storage";

export const CALL_LOW_DATA_KEY = "videh_call_low_data";

export type CallMediaSettings = {
  lowDataMode: boolean;
};

const DEFAULT: CallMediaSettings = { lowDataMode: false };

export async function getCallMediaSettings(): Promise<CallMediaSettings> {
  try {
    const v = await AsyncStorage.getItem(CALL_LOW_DATA_KEY);
    return { lowDataMode: v === "true" };
  } catch {
    return DEFAULT;
  }
}

export async function setCallLowDataMode(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(CALL_LOW_DATA_KEY, enabled ? "true" : "false");
}

/** WebRTC getUserMedia constraints (WhatsApp-style low data for calls). */
export function buildCallMediaConstraints(
  isVideo: boolean,
  lowData: boolean,
  facingMode: "user" | "environment" = "user",
): {
  audio: boolean | MediaTrackConstraints;
  video: boolean | MediaTrackConstraints;
} {
  const audio: MediaTrackConstraints = lowData
    ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

  if (!isVideo) {
    return { audio, video: false };
  }

  if (lowData) {
    return {
      audio,
      video: {
        width: { ideal: 480, max: 640 },
        height: { ideal: 360, max: 480 },
        frameRate: { ideal: 15, max: 20 },
        facingMode,
      },
    };
  }

  return {
    audio,
    video: {
      width: { ideal: 1280, max: 1920 },
      height: { ideal: 720, max: 1080 },
      frameRate: { ideal: 24, max: 30 },
      facingMode,
    },
  };
}
