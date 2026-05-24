import { Audio } from "expo-av";
import { buildVoiceFingerprint, type VoiceFingerprint } from "./assistantPrefs";

export async function recordVoiceSample(
  durationMs = 2200,
  onMeter?: (level: number) => void,
): Promise<VoiceFingerprint> {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error("Microphone permission required");

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const metering: number[] = [];
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
    (status) => {
      if (status.isRecording && status.metering != null) {
        metering.push(status.metering);
        onMeter?.(status.metering);
      }
    },
    120,
  );

  await new Promise((r) => setTimeout(r, durationMs));
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  if (uri) {
    try {
      const { deleteAsync } = await import("expo-file-system/legacy");
      await deleteAsync(uri, { idempotent: true });
    } catch { /* ignore */ }
  }
  return buildVoiceFingerprint(durationMs, metering);
}
