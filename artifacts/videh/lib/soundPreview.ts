import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { Platform } from "react-native";
import { agentDebugLog } from "./agentDebugLog";
import { SOUND_ASSETS } from "./premiumSounds";

let previewSound: Audio.Sound | null = null;

async function stopPreview(): Promise<void> {
  const s = previewSound;
  previewSound = null;
  if (!s) return;
  try {
    await s.stopAsync();
  } catch {}
  try {
    await s.unloadAsync();
  } catch {}
}

/** Play a short preview of a premium sound. */
export async function previewSoundAsset(soundId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const asset = SOUND_ASSETS[soundId];
  agentDebugLog("soundPreview.ts:previewSoundAsset", "preview attempt", { soundId, hasAsset: asset != null, platform: Platform.OS }, "H3");
  if (!asset) return;
  await stopPreview();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
  });
  try {
    const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: true, volume: 1 });
    previewSound = sound;
    agentDebugLog("soundPreview.ts:previewSoundAsset", "preview playing", { soundId }, "H3");
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) void stopPreview();
    });
  } catch (e) {
    agentDebugLog("soundPreview.ts:previewSoundAsset", "preview failed", { soundId, err: String(e) }, "H3");
  }
}
