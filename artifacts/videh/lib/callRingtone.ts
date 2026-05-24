import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { Platform, Vibration } from "react-native";
import { getCallAudioPrefs, type CallRingtoneId } from "./callAudioPrefs";

const RING_ASSETS: Record<Exclude<CallRingtoneId, "none">, number> = {
  default: require("../assets/sounds/incoming_call.ogg"),
  classic: require("../assets/sounds/incoming_call.ogg"),
};

let ringSound: Audio.Sound | null = null;
let loadSession = 0;
let vibrateActive = false;

async function configureCallAudioMode(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
  });
}

export async function startCallVibration(): Promise<void> {
  if (Platform.OS === "web") return;
  const prefs = await getCallAudioPrefs();
  if (!prefs.vibrate) return;
  vibrateActive = true;
  Vibration.vibrate([0, 700, 450], true);
}

export async function startCallRingtone(): Promise<void> {
  if (Platform.OS === "web") return;
  const session = ++loadSession;
  const prefs = await getCallAudioPrefs();
  if (prefs.ringtone === "none") return;

  await stopCallRingtoneInternal();

  try {
    await configureCallAudioMode();
    const source = RING_ASSETS[prefs.ringtone];
    const { sound } = await Audio.Sound.createAsync(
      source,
      { isLooping: true, volume: 1, shouldPlay: false },
    );
    if (session !== loadSession) {
      await sound.unloadAsync().catch(() => {});
      return;
    }
    ringSound = sound;
    await sound.playAsync();
  } catch {
    if (session === loadSession) ringSound = null;
  }
}

/** In-app incoming/outgoing ring + vibration (WhatsApp-style single source). */
export async function startCallAlert(): Promise<void> {
  await Promise.all([startCallVibration(), startCallRingtone()]);
}

async function stopCallRingtoneInternal(): Promise<void> {
  const sound = ringSound;
  ringSound = null;
  if (!sound) return;
  try {
    await sound.stopAsync();
  } catch {}
  try {
    await sound.unloadAsync();
  } catch {}
}

export async function stopCallRingtone(): Promise<void> {
  loadSession++;
  await stopCallRingtoneInternal();
}

export function stopCallVibration(): void {
  if (Platform.OS === "web") return;
  vibrateActive = false;
  Vibration.cancel();
}

/** Stop ringtone and vibration — call on accept, decline, end, and unmount. */
export async function stopCallAlert(): Promise<void> {
  stopCallVibration();
  await stopCallRingtone();
}

export function isCallVibrationActive(): boolean {
  return vibrateActive;
}
