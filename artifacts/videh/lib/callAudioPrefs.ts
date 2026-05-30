import type { CallSoundId } from "./premiumSounds";
import { getSoundPrefs, patchSoundPrefs, type SoundPrefs } from "./soundPrefs";

export type { CallSoundId };
export type CallAudioRouteId = "earpiece" | "speaker" | "bluetooth";

export const CALL_RINGTONE_KEY = "videh_call_ringtone";
export const CALL_VIBRATE_KEY = "videh_call_vibrate";

export type CallAudioPrefs = {
  ringtone: CallSoundId;
  vibrate: boolean;
};

export const CALL_AUDIO_ROUTE_LABELS: Record<CallAudioRouteId, string> = {
  earpiece: "Phone",
  speaker: "Speaker",
  bluetooth: "Bluetooth",
};

export function labelForCallRingtone(id: CallSoundId | string): string {
  const { labelForSoundId } = require("./premiumSounds") as typeof import("./premiumSounds");
  return labelForSoundId(String(id));
}

export async function getCallAudioPrefs(): Promise<{ ringtone: CallSoundId; vibrate: boolean }> {
  return getCallAudioPrefsFull();
}

export async function getCallAudioPrefsFull(): Promise<{ ringtone: CallSoundId; vibrate: boolean }> {
  try {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const vibrateRaw = await AsyncStorage.getItem(CALL_VIBRATE_KEY);
    const prefs = await getSoundPrefs();
    return {
      ringtone: prefs.globalCallSound,
      vibrate: vibrateRaw == null ? true : vibrateRaw !== "false",
    };
  } catch {
    const prefs = await getSoundPrefs();
    return { ringtone: prefs.globalCallSound, vibrate: true };
  }
}

export async function setCallRingtonePref(ringtone: CallSoundId): Promise<void> {
  await patchSoundPrefs({ globalCallSound: ringtone });
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  await AsyncStorage.setItem(CALL_RINGTONE_KEY, ringtone);
  const { applyVidehNotificationSounds } = await import("./applyNotificationChannels");
  await applyVidehNotificationSounds();
}

export async function setCallVibratePref(vibrate: boolean): Promise<void> {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  await AsyncStorage.setItem(CALL_VIBRATE_KEY, vibrate ? "true" : "false");
}

export function callRingtoneIdFromLabel(label: string): CallSoundId {
  const { CALL_RINGTONES, resolveLegacyCallRingtone } = require("./premiumSounds") as typeof import("./premiumSounds");
  const found = CALL_RINGTONES.find((r) => r.label.toLowerCase() === label.toLowerCase());
  if (found) return resolveLegacyCallRingtone(found.id);
  return "call_default";
}
