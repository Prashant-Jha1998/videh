import AsyncStorage from "@react-native-async-storage/async-storage";

export const CALL_RINGTONE_KEY = "videh_call_ringtone";
export const CALL_VIBRATE_KEY = "videh_call_vibrate";

export type CallRingtoneId = "default" | "classic" | "none";

export type CallAudioPrefs = {
  ringtone: CallRingtoneId;
  vibrate: boolean;
};

const DEFAULT_PREFS: CallAudioPrefs = { ringtone: "default", vibrate: true };

export function labelForCallRingtone(id: CallRingtoneId): string {
  if (id === "classic") return "Classic";
  if (id === "none") return "None";
  return "Default";
}

export function callRingtoneIdFromLabel(label: string): CallRingtoneId {
  const lower = label.toLowerCase();
  if (lower === "none") return "none";
  if (lower === "classic") return "classic";
  return "default";
}

export async function getCallAudioPrefs(): Promise<CallAudioPrefs> {
  try {
    const rows = await AsyncStorage.multiGet([CALL_RINGTONE_KEY, CALL_VIBRATE_KEY]);
    const ringtoneRaw = rows.find(([k]) => k === CALL_RINGTONE_KEY)?.[1];
    const vibrateRaw = rows.find(([k]) => k === CALL_VIBRATE_KEY)?.[1];
    const ringtone =
      ringtoneRaw === "classic" || ringtoneRaw === "none" || ringtoneRaw === "default"
        ? ringtoneRaw
        : DEFAULT_PREFS.ringtone;
    return {
      ringtone,
      vibrate: vibrateRaw == null ? DEFAULT_PREFS.vibrate : vibrateRaw !== "false",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function setCallRingtonePref(ringtone: CallRingtoneId): Promise<void> {
  await AsyncStorage.setItem(CALL_RINGTONE_KEY, ringtone);
}

export async function setCallVibratePref(vibrate: boolean): Promise<void> {
  await AsyncStorage.setItem(CALL_VIBRATE_KEY, vibrate ? "true" : "false");
}
