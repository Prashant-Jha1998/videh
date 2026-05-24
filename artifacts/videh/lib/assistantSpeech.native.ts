import * as Speech from "expo-speech";
import { Platform } from "react-native";

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

export async function speakAssistant(text: string, locale: "hi" | "en" = "hi"): Promise<void> {
  await new Promise<void>((resolve) => {
    Speech.speak(text, {
      language: locale === "hi" ? "hi-IN" : "en-IN",
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
  locale?: "hi" | "en";
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
  const locale = opts.locale === "en" ? "en-IN" : "hi-IN";
  await Voice.start(locale);
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
