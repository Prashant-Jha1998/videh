import * as Speech from "expo-speech";
import { Platform } from "react-native";
import {
  normalizeLangCode,
  toRecognitionLocale,
  toSpeechLocale,
  type AssistantLangCode,
} from "./assistantLanguages";

let Voice: {
  isAvailable: () => Promise<boolean>;
  start: (locale: string) => Promise<void>;
  stop: () => Promise<void>;
  destroy: () => Promise<void>;
  onSpeechResults: ((e: { value?: string[] }) => void) | null;
  onSpeechPartialResults: ((e: { value?: string[] }) => void) | null;
  onSpeechError: ((e: { error?: { message?: string } }) => void) | null;
} | null = null;

try {
  Voice = require("@react-native-voice/voice").default;
} catch {
  Voice = null;
}

export function isSpeechRecognitionAvailable(): boolean {
  return Platform.OS !== "web" && Voice != null;
}

export async function speakAssistant(
  text: string,
  langOrLocale: AssistantLangCode | string = "hi",
): Promise<void> {
  const locale = langOrLocale.includes("-")
    ? langOrLocale
    : toSpeechLocale(normalizeLangCode(langOrLocale));
  await new Promise<void>((resolve) => {
    Speech.speak(text, {
      language: locale,
      rate: Platform.OS === "ios" ? 0.95 : 1,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export async function stopSpeaking(): Promise<void> {
  Speech.stop();
}

type ListenOpts = {
  locale?: AssistantLangCode | string;
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
};

export async function startListening(opts: ListenOpts): Promise<void> {
  if (!Voice) {
    opts.onError?.("Speech recognition not available on this device.");
    return;
  }
  Voice.onSpeechPartialResults = (e) => {
    const text = e.value?.[0] ?? "";
    if (text) opts.onPartial?.(text);
  };
  Voice.onSpeechResults = (e) => {
    const text = e.value?.[0] ?? "";
    if (text) opts.onFinal?.(text);
  };
  Voice.onSpeechError = (e) => {
    opts.onError?.(e.error?.message ?? "Speech error");
  };
  const code = normalizeLangCode(
    typeof opts.locale === "string" && opts.locale.includes("-")
      ? opts.locale.split("-")[0]
      : opts.locale,
  );
  await Voice.start(toRecognitionLocale(code));
}

export async function stopListening(): Promise<void> {
  if (!Voice) return;
  try {
    await Voice.stop();
  } catch { /* ignore */ }
}

export async function destroySpeech(): Promise<void> {
  if (!Voice) return;
  try {
    await Voice.destroy();
  } catch { /* ignore */ }
}
