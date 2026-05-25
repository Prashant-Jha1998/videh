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
  let rmsLevels = meteringSamples
    .filter((n) => Number.isFinite(n))
    .map((n) => Math.max(0, Math.min(1, (n + 160) / 160)));
  const peakLevel = rmsLevels.length ? Math.max(...rmsLevels) : 0.25;
  while (rmsLevels.length < 10) {
    rmsLevels.push(peakLevel * (0.85 + (rmsLevels.length % 3) * 0.05));
  }
  return { durationMs, rmsLevels, peakLevel };
}

export {
  containsWakePhrase,
  stripWakeFromCommand,
  extractCommandAfterWake,
  parseWakeUtterance,
  WAKE_CONTEXT_STRINGS as WAKE_PHRASES,
} from "./assistantWake";
