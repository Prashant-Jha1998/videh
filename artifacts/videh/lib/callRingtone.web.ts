import { Audio } from "expo-av";
import { SOUND_ASSETS } from "./premiumSounds";
import { resolveLegacyCallRingtone, type CallSoundId } from "./premiumSounds";
import { getCallAudioPrefsFull } from "./callAudioPrefs";

let ringSound: Audio.Sound | null = null;
let ringbackSound: Audio.Sound | null = null;
let ringSession = 0;
let ringbackSession = 0;

function ringAsset(id: CallSoundId): number | null {
  if (id === "none") return null;
  return SOUND_ASSETS[id] ?? SOUND_ASSETS.call_default ?? null;
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
  /* no vibration on web */
}

export function stopCallVibration(): void {}

export async function startIncomingCallAlert(): Promise<void> {
  await stopOutgoingRingback();
  const session = ++ringSession;
  const prefs = await getCallAudioPrefsFull();
  const ringId = resolveLegacyCallRingtone(prefs.ringtone);
  if (ringId === "none") return;

  await stopCallRingtoneInternal();
  const asset = ringAsset(ringId);
  if (!asset) return;

  try {
    const { sound } = await Audio.Sound.createAsync(asset, { isLooping: true, volume: 1, shouldPlay: false });
    if (session !== ringSession) {
      await sound.unloadAsync().catch(() => {});
      return;
    }
    ringSound = sound;
    await sound.playAsync();
  } catch {
    if (session === ringSession) ringSound = null;
  }
}

export async function startOutgoingRingback(): Promise<void> {
  await stopCallRingtoneInternal();
  const session = ++ringbackSession;
  try {
    const asset = SOUND_ASSETS.ringback;
    const { sound } = await Audio.Sound.createAsync(asset, { isLooping: true, volume: 0.85, shouldPlay: false });
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

export async function playCallBusyTone(): Promise<void> {
  await stopCallAlert();
  try {
    const { sound } = await Audio.Sound.createAsync(SOUND_ASSETS.call_busy, { volume: 0.95 });
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) void sound.unloadAsync().catch(() => {});
    });
  } catch {}
}

export async function playCallUnavailableTone(): Promise<void> {
  await stopCallAlert();
  try {
    const { sound } = await Audio.Sound.createAsync(SOUND_ASSETS.call_unavailable, { volume: 0.95 });
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && st.didJustFinish) void sound.unloadAsync().catch(() => {});
    });
  } catch {}
}

export async function startCallAlert(): Promise<void> {
  await startIncomingCallAlert();
}

export async function stopCallRingtone(): Promise<void> {
  await stopCallRingtoneInternal();
}

export async function stopCallAlert(): Promise<void> {
  await stopCallRingtoneInternal();
  await stopOutgoingRingback();
}

export function isCallVibrationActive(): boolean {
  return false;
}
