import { Platform } from "react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

/** Known Android speech engines (device default preferred; no extra app install required). */
const FALLBACK_PACKAGES = [
  "com.google.android.tts",
  "com.google.android.googlequicksearchbox",
  "com.google.android.as",
  "com.samsung.android.bixby.agent",
  "com.microsoft.cognitiveservices.speech.recognition",
] as const;

let resolvedPackage: string | undefined | null = null;

function listAvailablePackages(): string[] {
  try {
    return ExpoSpeechRecognitionModule.getSpeechRecognitionServices() ?? [];
  } catch {
    return [];
  }
}

function pickFirstAvailable(candidates: readonly string[], available: string[]): string | undefined {
  if (available.length === 0) return candidates[0];
  const installed = new Set(available);
  return candidates.find((pkg) => installed.has(pkg));
}

/**
 * Picks an Android speech recognition package when one is known to work.
 * Returns `undefined` to use the OS default recognizer (no forced Google App).
 */
export function resolveAndroidRecognitionServicePackage(): string | undefined {
  if (Platform.OS !== "android") return undefined;
  if (resolvedPackage !== null) {
    return resolvedPackage === "" ? undefined : resolvedPackage;
  }

  const available = listAvailablePackages();

  try {
    const defaultPkg = ExpoSpeechRecognitionModule.getDefaultRecognitionService()
      ?.packageName?.trim();
    if (defaultPkg) {
      if (available.length === 0 || available.includes(defaultPkg)) {
        resolvedPackage = defaultPkg;
        return defaultPkg;
      }
    }
  } catch {
    /* use fallbacks */
  }

  const fallback = pickFirstAvailable(FALLBACK_PACKAGES, available);
  if (fallback) {
    resolvedPackage = fallback;
    return fallback;
  }

  if (available.length > 0) {
    resolvedPackage = available[0];
    return available[0];
  }

  resolvedPackage = "";
  return undefined;
}

export function getAndroidSpeechEngineLabel(): string | null {
  if (Platform.OS !== "android") return null;
  const pkg = resolveAndroidRecognitionServicePackage();
  return pkg ?? "System default";
}

export function formatSpeechRecognitionError(message: string): string {
  if (/no service found for package/i.test(message)) {
    return "Voice input engine not available. Open Settings → System → Languages → Voice input and choose a speech-to-text service.";
  }
  if (/bind to system recognition service failed/i.test(message)) {
    return "Could not connect to voice input. Check microphone permission and your device's speech-to-text settings.";
  }
  return message;
}
