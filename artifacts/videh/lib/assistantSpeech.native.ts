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
import {
  formatSpeechRecognitionError,
  resolveAndroidRecognitionServicePackage,
} from "./androidSpeechService";
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

let permissionsGranted = false;

export async function speakAssistant(
  text: string,
  langOrLocale: AssistantLangCode | string = "hi",
): Promise<void> {
  const locale = langOrLocale.includes("-")
    ? langOrLocale
    : toSpeechLocale(normalizeLangCode(langOrLocale));
  const short = text.length > 160 ? `${text.slice(0, 157)}…` : text;
  await new Promise<void>((resolve) => {
    Speech.speak(short, {
      language: locale,
      rate: Platform.OS === "ios" ? 1.05 : 1.08,
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

  if (!permissionsGranted) {
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      opts.onError?.("Microphone and speech permissions are required.");
      return;
    }
    permissionsGranted = true;
  }

  try {
    Speech.stop();
  } catch { /* ignore */ }

  clearSpeechListeners();
  resultListener = ExpoSpeechRecognitionModule.addListener("result", (event) => {
    const text = event.results?.[0]?.transcript?.trim() ?? "";
    if (!text) return;
    if (event.isFinal) opts.onFinal?.(text);
    else opts.onPartial?.(text);
  });
  errorListener = ExpoSpeechRecognitionModule.addListener("error", (event) => {
    const raw = event.message ?? event.error ?? "Speech error";
    opts.onError?.(formatSpeechRecognitionError(raw));
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
  const androidService =
    Platform.OS === "android" ? resolveAndroidRecognitionServicePackage() : undefined;
  try {
    ExpoSpeechRecognitionModule.start({
      lang: opts.wakeMode ? wakeLang : toRecognitionLocale(code),
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      contextualStrings: opts.wakeMode ? WAKE_CONTEXT_STRINGS : undefined,
      iosTaskHint: opts.wakeMode ? "dictation" : "unspecified",
      ...(androidService ? { androidRecognitionServicePackage: androidService } : {}),
      androidIntentOptions: {
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: opts.wakeMode ? 3500 : 1400,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: opts.wakeMode ? 2000 : 900,
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
  } catch (e: unknown) {
    opts.onError?.(e instanceof Error ? e.message : "Speech recognition failed to start.");
  }
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
