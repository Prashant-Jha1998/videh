import * as Speech from "expo-speech";
import {
  AVAudioSessionCategory,
  AVAudioSessionCategoryOptions,
  AVAudioSessionMode,
  ExpoSpeechRecognitionModule,
} from "expo-speech-recognition";
import { Platform } from "react-native";
import {
  normalizeLangCode,
  toRecognitionLocale,
  toSpeechLocale,
  type AssistantLangCode,
} from "./assistantLanguages";
import { WAKE_CONTEXT_STRINGS } from "./assistantWake";

type Listener = { remove: () => void };

let resultListener: Listener | null = null;
let errorListener: Listener | null = null;
let endListener: Listener | null = null;

function clearSpeechListeners(): void {
  resultListener?.remove();
  errorListener?.remove();
  endListener?.remove();
  resultListener = null;
  errorListener = null;
  endListener = null;
}

export function isSpeechRecognitionAvailable(): boolean {
  if (Platform.OS === "web") return false;
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
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
  /** Wake-word loop: biased phrases, hands-free Android intent, lock-friendly iOS audio session. */
  wakeMode?: boolean;
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

export async function startListening(opts: ListenOpts): Promise<void> {
  if (!isSpeechRecognitionAvailable()) {
    opts.onError?.("Speech recognition not available on this device.");
    return;
  }

  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) {
    opts.onError?.("Microphone and speech permissions are required.");
    return;
  }

  clearSpeechListeners();
  resultListener = ExpoSpeechRecognitionModule.addListener("result", (event) => {
    const text = event.results?.[0]?.transcript?.trim() ?? "";
    if (!text) return;
    if (event.isFinal) opts.onFinal?.(text);
    else opts.onPartial?.(text);
  });
  errorListener = ExpoSpeechRecognitionModule.addListener("error", (event) => {
    opts.onError?.(event.message ?? event.error ?? "Speech error");
  });
  endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
    opts.onEnd?.();
  });

  const code = normalizeLangCode(
    typeof opts.locale === "string" && opts.locale.includes("-")
      ? opts.locale.split("-")[0]
      : opts.locale,
  );

  const wakeLang = toRecognitionLocale(code);
  ExpoSpeechRecognitionModule.start({
    lang: opts.wakeMode ? wakeLang : toRecognitionLocale(code),
    interimResults: true,
    continuous: opts.wakeMode ? true : true,
    contextualStrings: opts.wakeMode ? WAKE_CONTEXT_STRINGS : undefined,
    androidIntent: opts.wakeMode ? "android.speech.action.VOICE_SEARCH_HANDS_FREE" : undefined,
    androidIntentOptions: {
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: opts.wakeMode ? 2500 : 12000,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: opts.wakeMode ? 1500 : 5000,
    },
    iosCategory: opts.wakeMode
      ? {
          category: AVAudioSessionCategory.playAndRecord,
          categoryOptions: [
            AVAudioSessionCategoryOptions.defaultToSpeaker,
            AVAudioSessionCategoryOptions.allowBluetooth,
            AVAudioSessionCategoryOptions.mixWithOthers,
          ],
          mode: AVAudioSessionMode.measurement,
        }
      : undefined,
  });
}

export async function stopListening(): Promise<void> {
  try {
    ExpoSpeechRecognitionModule.stop();
  } catch { /* ignore */ }
  clearSpeechListeners();
}

export async function destroySpeech(): Promise<void> {
  try {
    ExpoSpeechRecognitionModule.abort();
  } catch { /* ignore */ }
  clearSpeechListeners();
}
