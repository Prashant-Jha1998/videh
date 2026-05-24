import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { Platform, Vibration } from "react-native";
import { getCallAudioPrefs, type CallRingtoneId } from "./callAudioPrefs";

const SOUNDS = {
  incoming: require("../assets/sounds/incoming_call.ogg"),
  ringback: require("../assets/sounds/ringback.ogg"),
  busy: require("../assets/sounds/call_busy.ogg"),
  unavailable: require("../assets/sounds/call_unavailable.ogg"),
} as const;

const RING_ASSETS: Record<Exclude<CallRingtoneId, "none">, number> = {
  default: SOUNDS.incoming,
  classic: SOUNDS.incoming,
};

let ringSound: Audio.Sound | null = null;
let ringbackSound: Audio.Sound | null = null;
let effectSound: Audio.Sound | null = null;
let ringSession = 0;
let ringbackSession = 0;
let vibrateActive = false;

async function configureCallAudioMode(earpiece = false): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: earpiece,
  });
}

async function stopSound(sound: Audio.Sound | null): Promise<void> {
  if (!sound) return;
  try {
    await sound.stopAsync();
  } catch {}
  try {
    await sound.unloadAsync();
  } catch {}
}

export async function startCallVibration(): Promise<void> {
  if (Platform.OS === "web") return;
  const prefs = await getCallAudioPrefs();
  if (!prefs.vibrate) return;
  vibrateActive = true;
  Vibration.vibrate([0, 700, 450], true);
}

export function stopCallVibration(): void {
  if (Platform.OS === "web") return;
  vibrateActive = false;
  Vibration.cancel();
}

/** Callee: Videh-style incoming ring + vibration. */
export async function startIncomingCallAlert(): Promise<void> {
  if (Platform.OS === "web") return;
  await stopOutgoingRingback();
  const session = ++ringSession;
  const prefs = await getCallAudioPrefs();
  if (prefs.ringtone === "none") {
    await startCallVibration();
    return;
  }

  await stopCallRingtoneInternal();

  try {
    await configureCallAudioMode(false);
    const { sound } = await Audio.Sound.createAsync(RING_ASSETS[prefs.ringtone], {
      isLooping: true,
      volume: 1,
      shouldPlay: false,
    });
    if (session !== ringSession) {
      await sound.unloadAsync().catch(() => {});
      return;
    }
    ringSound = sound;
    await Promise.all([sound.playAsync(), startCallVibration()]);
  } catch {
    if (session === ringSession) ringSound = null;
  }
}

/** Caller: ringback tone while waiting (not the callee ring). */
export async function startOutgoingRingback(): Promise<void> {
  if (Platform.OS === "web") return;
  await stopCallRingtoneInternal();
  const session = ++ringbackSession;

  try {
    await configureCallAudioMode(true);
    const { sound } = await Audio.Sound.createAsync(SOUNDS.ringback, {
      isLooping: true,
      volume: 0.9,
      shouldPlay: false,
    });
    if (session !== ringbackSession) {
      await sound.unloadAsync().catch(() => {});
      return;
    }
    ringbackSound = sound;
    await sound.playAsync();
  } catch {
    if (session === ringbackSession) ringbackSound = null;
  }
}

async function stopCallRingtoneInternal(): Promise<void> {
  ringSession++;
  const sound = ringSound;
  ringSound = null;
  await stopSound(sound);
}

async function stopOutgoingRingback(): Promise<void> {
  ringbackSession++;
  const sound = ringbackSound;
  ringbackSound = null;
  await stopSound(sound);
}

async function playEffect(asset: number): Promise<void> {
  if (Platform.OS === "web") return;
  await stopEffectInternal();
  try {
    await configureCallAudioMode(true);
    const { sound } = await Audio.Sound.createAsync(asset, { isLooping: false, volume: 0.95 });
    effectSound = sound;
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) {
        void stopEffectInternal();
      }
    });
    await sound.playAsync();
  } catch {
    effectSound = null;
  }
}

async function stopEffectInternal(): Promise<void> {
  const s = effectSound;
  effectSound = null;
  await stopSound(s);
}

/** Callee busy / line engaged (short beeps). */
export async function playCallBusyTone(): Promise<void> {
  await stopCallAlert();
  await playEffect(SOUNDS.busy);
}

/** Could not reach / no answer on network (short tone). */
export async function playCallUnavailableTone(): Promise<void> {
  await stopCallAlert();
  await playEffect(SOUNDS.unavailable);
}

/** @deprecated Use startIncomingCallAlert or startOutgoingRingback */
export async function startCallAlert(): Promise<void> {
  await startIncomingCallAlert();
}

export async function stopCallRingtone(): Promise<void> {
  await stopCallRingtoneInternal();
}

/** Stop all call sounds + vibration. */
export async function stopCallAlert(): Promise<void> {
  stopCallVibration();
  await Promise.all([stopCallRingtoneInternal(), stopOutgoingRingback(), stopEffectInternal()]);
}

export function isCallVibrationActive(): boolean {
  return vibrateActive;
}
