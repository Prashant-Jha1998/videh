import { Audio } from "expo-av";
import { buildVoiceFingerprint, type VoiceFingerprint } from "./assistantPrefs";

export type VoiceEnrollmentSample = {
  fingerprint: VoiceFingerprint;
  uri: string;
};

export async function recordVoiceSample(
  durationMs = 2400,
  onMeter?: (level: number) => void,
): Promise<VoiceEnrollmentSample> {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error("Microphone permission is required.");

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    playThroughEarpieceAndroid: false,
  });

  const metering: number[] = [];
  const { recording } = await Audio.Recording.createAsync(
    { ...Audio.RecordingOptionsPresets.LOW_QUALITY, isMeteringEnabled: true as const },
    (status) => {
      if (status.isRecording && status.metering != null) {
        metering.push(status.metering);
        const level = Math.max(0.08, Math.min(1, (status.metering + 55) / 60));
        onMeter?.(level);
      }
    },
    100,
  );

  await new Promise((r) => setTimeout(r, durationMs));
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  if (!uri) throw new Error("Recording failed — no audio file.");

  return {
    fingerprint: buildVoiceFingerprint(durationMs, metering),
    uri,
  };
}

export async function playEnrollmentSample(uri: string): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    playThroughEarpieceAndroid: false,
  });
  const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: 1 });
  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) {
        void sound.unloadAsync().finally(resolve);
      }
    });
  });
}

export async function deleteEnrollmentFile(uri: string): Promise<void> {
  try {
    const { deleteAsync } = await import("expo-file-system/legacy");
    await deleteAsync(uri, { idempotent: true });
  } catch { /* ignore */ }
}
