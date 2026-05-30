import AsyncStorage from "@react-native-async-storage/async-storage";
import { agentDebugLog } from "./agentDebugLog";
import type { CallSoundId, ContactSoundPresetId, MessageSoundId, SoundPackId } from "./premiumSounds";
import {
  CONTACT_SOUND_PRESETS,
  isValidCallSoundId,
  isValidMessageSoundId,
  resolveLegacyCallRingtone,
} from "./premiumSounds";

const KEY = "videh_sound_prefs_v1";

export type SoundPrefs = {
  globalMessageSound: MessageSoundId;
  globalGroupMessageSound: MessageSoundId;
  globalCallSound: CallSoundId;
  enabledPacks: SoundPackId[];
  /** chatId → custom message sound (overrides preset & global) */
  chatMessageSounds: Record<string, MessageSoundId>;
  /** chatId → quick preset */
  chatPresets: Record<string, ContactSoundPresetId>;
};

const DEFAULTS: SoundPrefs = {
  globalMessageSound: "msg_default",
  globalGroupMessageSound: "msg_default",
  globalCallSound: "call_default",
  enabledPacks: ["modern", "professional", "romantic"],
  chatMessageSounds: {},
  chatPresets: {},
};

export async function getSoundPrefs(): Promise<SoundPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      globalMessageSound: isValidMessageSoundId(parsed.globalMessageSound ?? "")
        ? parsed.globalMessageSound
        : DEFAULTS.globalMessageSound,
      globalGroupMessageSound: isValidMessageSoundId(parsed.globalGroupMessageSound ?? "")
        ? parsed.globalGroupMessageSound
        : DEFAULTS.globalGroupMessageSound,
      globalCallSound: resolveLegacyCallRingtone(String(parsed.globalCallSound ?? "call_default")),
      enabledPacks: Array.isArray(parsed.enabledPacks) ? parsed.enabledPacks : DEFAULTS.enabledPacks,
      chatMessageSounds: parsed.chatMessageSounds ?? {},
      chatPresets: parsed.chatPresets ?? {},
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSoundPrefs(prefs: SoundPrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  const { scheduleSoundPrefsSync } = await import("./syncSoundPrefs");
  scheduleSoundPrefsSync();
}

export async function patchSoundPrefs(patch: Partial<SoundPrefs>): Promise<SoundPrefs> {
  const next = { ...(await getSoundPrefs()), ...patch };
  await saveSoundPrefs(next);
  return next;
}

export async function setChatSoundPreset(
  chatId: string,
  preset: ContactSoundPresetId,
  messageSoundId?: MessageSoundId,
): Promise<SoundPrefs> {
  const prefs = await getSoundPrefs();
  prefs.chatPresets[chatId] = preset;
  if (messageSoundId && preset !== "default") {
    prefs.chatMessageSounds[chatId] = messageSoundId;
  } else if (preset === "default") {
    delete prefs.chatMessageSounds[chatId];
    delete prefs.chatPresets[chatId];
  }
  await saveSoundPrefs(prefs);
  agentDebugLog(
    "soundPrefs.ts:setChatSoundPreset",
    "per-chat preset saved",
    { chatId, preset, messageSoundId: prefs.chatMessageSounds[chatId] },
    "H4",
  );
  return prefs;
}

export async function setChatCustomMessageSound(
  chatId: string,
  soundId: MessageSoundId | null,
): Promise<SoundPrefs> {
  const prefs = await getSoundPrefs();
  if (!soundId || soundId === "msg_default") {
    delete prefs.chatMessageSounds[chatId];
  } else {
    prefs.chatMessageSounds[chatId] = soundId;
  }
  await saveSoundPrefs(prefs);
  return prefs;
}

export function getEffectiveMessageSound(
  prefs: SoundPrefs,
  chatId: string,
  isGroup: boolean,
): MessageSoundId {
  const custom = prefs.chatMessageSounds[chatId];
  if (custom && isValidMessageSoundId(custom)) return custom;
  const presetId = prefs.chatPresets[chatId];
  if (presetId && presetId !== "default") {
    const preset = CONTACT_SOUND_PRESETS.find((p) => p.id === presetId);
    if (preset) return preset.messageSoundId;
  }
  return isGroup ? prefs.globalGroupMessageSound : prefs.globalMessageSound;
}
