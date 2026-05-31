import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { Platform } from "react-native";
import { SOUND_ASSETS } from "./premiumSounds";

let activeSound: Audio.Sound | null = null;

async function stopActive(): Promise<void> {
  const s = activeSound;
  activeSound = null;
  if (!s) return;
  try {
    await s.stopAsync();
  } catch {
    /* ignore */
  }
  try {
    await s.unloadAsync();
  } catch {
    /* ignore */
  }
}

/** Short in-app alert (foreground) using the same bundled tone as notifications. */
export async function playInAppSoundAsset(soundId: string): Promise<void> {
  if (Platform.OS === "web") return;
  const asset = SOUND_ASSETS[soundId];
  if (!asset) return;
  await stopActive();
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
  });
  try {
    const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: true, volume: 1 });
    activeSound = sound;
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) void stopActive();
    });
  } catch {
    activeSound = null;
  }
}
