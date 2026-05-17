import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { Platform } from "react-native";

let ringSound: Audio.Sound | null = null;
let playing = false;

/** Short loop-friendly ring pattern (bundled-free, works offline). */
const RING_URI =
  "https://actions.google.com/sounds/v1/alarms/phone_alerts_and_rings.ogg";

export async function startCallRingtone(): Promise<void> {
  if (Platform.OS === "web" || playing) return;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    if (ringSound) {
      await ringSound.unloadAsync().catch(() => {});
      ringSound = null;
    }
    const { sound } = await Audio.Sound.createAsync(
      { uri: RING_URI },
      { isLooping: true, volume: 1, shouldPlay: true },
    );
    ringSound = sound;
    playing = true;
  } catch {
    playing = false;
  }
}

export async function stopCallRingtone(): Promise<void> {
  playing = false;
  if (!ringSound) return;
  try {
    await ringSound.stopAsync();
    await ringSound.unloadAsync();
  } catch {
    // ignore
  } finally {
    ringSound = null;
  }
}
