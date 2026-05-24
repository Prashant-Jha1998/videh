export type AssistantLangCode =
  | "hi"
  | "en"
  | "bn"
  | "ta"
  | "te"
  | "mr"
  | "gu"
  | "kn"
  | "ml"
  | "pa"
  | "or"
  | "as"
  | "ur";

const SPEECH_LOCALE: Record<AssistantLangCode, string> = {
  hi: "hi-IN",
  en: "en-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  mr: "mr-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
  or: "or-IN",
  as: "as-IN",
  ur: "ur-IN",
};

export function normalizeLangCode(raw?: string | null): AssistantLangCode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v.startsWith("en")) return "en";
  if (v.startsWith("bn")) return "bn";
  if (v.startsWith("ta")) return "ta";
  if (v.startsWith("te")) return "te";
  if (v.startsWith("mr")) return "mr";
  if (v.startsWith("gu")) return "gu";
  if (v.startsWith("kn")) return "kn";
  if (v.startsWith("ml")) return "ml";
  if (v.startsWith("pa")) return "pa";
  if (v.startsWith("or")) return "or";
  if (v.startsWith("as")) return "as";
  if (v.startsWith("ur")) return "ur";
  return "hi";
}

export function toSpeechLocale(code: AssistantLangCode): string {
  return SPEECH_LOCALE[code] ?? "hi-IN";
}

export function toRecognitionLocale(code: AssistantLangCode): string {
  return SPEECH_LOCALE[code] ?? "hi-IN";
}

function scriptHint(text: string): AssistantLangCode | null {
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0900 && cp <= 0x097f) return "hi";
    if (cp >= 0x0980 && cp <= 0x09ff) return "bn";
    if (cp >= 0x0a80 && cp <= 0x0aff) return "gu";
    if (cp >= 0x0a00 && cp <= 0x0a7f) return "pa";
    if (cp >= 0x0b00 && cp <= 0x0b7f) return "or";
    if (cp >= 0x0b80 && cp <= 0x0bff) return "ta";
    if (cp >= 0x0c00 && cp <= 0x0c7f) return "te";
    if (cp >= 0x0c80 && cp <= 0x0cff) return "kn";
    if (cp >= 0x0d00 && cp <= 0x0d7f) return "ml";
    if (cp >= 0x0600 && cp <= 0x06ff) return "ur";
  }
  if (/^[a-zA-Z0-9\s.,!?'"-]+$/.test(text.trim())) return "en";
  return null;
}

/** Quick client-side locale guess from partial transcript (for STT). */
export function detectLocaleFromTranscript(text: string): AssistantLangCode {
  return scriptHint(text) ?? "hi";
}
