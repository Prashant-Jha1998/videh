import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AssistantLangCode } from "./assistantLanguages";

export type AssistantPrefs = {
  enabled: boolean;
  voiceEnrolled: boolean;
  listenWhenLocked: boolean;
  userName: string;
  lastLangCode?: AssistantLangCode;
};

const KEY = "videh_assistant_prefs_v1";

export async function getLocalAssistantPrefs(): Promise<Partial<AssistantPrefs>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) as Partial<AssistantPrefs> : {};
  } catch {
    return {};
  }
}

export async function setLocalAssistantPrefs(prefs: Partial<AssistantPrefs>): Promise<void> {
  const prev = await getLocalAssistantPrefs();
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...prev, ...prefs }));
}

export type VoiceFingerprint = {
  durationMs: number;
  rmsLevels: number[];
  peakLevel: number;
};

export function buildVoiceFingerprint(
  durationMs: number,
  meteringSamples: number[],
): VoiceFingerprint {
  const rmsLevels = meteringSamples
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.max(0, Math.min(1, (n + 160) / 160)));
  const peakLevel = rmsLevels.length ? Math.max(...rmsLevels) : 0;
  return { durationMs, rmsLevels, peakLevel };
}

export const WAKE_PHRASES = ["hey videh", "he videh", "hey vede", "हे विदेह", "hey video"];

export function containsWakePhrase(text: string): boolean {
  const n = text.toLowerCase().trim();
  return WAKE_PHRASES.some((p) => n.includes(p));
}

/** Remove wake phrase if user repeats it in the command. */
export function stripWakeFromCommand(text: string): string {
  return text
    .replace(/^(hey\s+videh|he\s+videh|videh|हे\s+विदेह|हे\s+वीडेह)[,\s]*/i, "")
    .trim();
}
