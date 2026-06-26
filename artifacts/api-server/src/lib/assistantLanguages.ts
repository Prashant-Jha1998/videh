/** Supported Indian languages for Hey Videh assistant. */
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

export const INDIAN_LANGUAGE_LABELS: Record<AssistantLangCode, string> = {
  hi: "Hindi",
  en: "English",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  gu: "Gujarati",
  kn: "Kannada",
  ml: "Malayalam",
  pa: "Punjabi",
  or: "Odia",
  as: "Assamese",
  ur: "Urdu",
};

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

export function toSpeechLocale(code: AssistantLangCode): string {
  return SPEECH_LOCALE[code] ?? "en-IN";
}

export function toRecognitionLocale(code: AssistantLangCode): string {
  return SPEECH_LOCALE[code] ?? "en-IN";
}

export function normalizeLangCode(raw?: string | null): AssistantLangCode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "en" || v.startsWith("en-")) return "en";
  if (v === "hi" || v.startsWith("hi-")) return "hi";
  if (v === "bn" || v.startsWith("bn-")) return "bn";
  if (v === "ta" || v.startsWith("ta-")) return "ta";
  if (v === "te" || v.startsWith("te-")) return "te";
  if (v === "mr" || v.startsWith("mr-")) return "mr";
  if (v === "gu" || v.startsWith("gu-")) return "gu";
  if (v === "kn" || v.startsWith("kn-")) return "kn";
  if (v === "ml" || v.startsWith("ml-")) return "ml";
  if (v === "pa" || v.startsWith("pa-")) return "pa";
  if (v === "or" || v.startsWith("or-")) return "or";
  if (v === "as" || v.startsWith("as-")) return "as";
  if (v === "ur" || v.startsWith("ur-")) return "ur";
  return "en";
}

function scriptScore(text: string): Partial<Record<AssistantLangCode, number>> {
  const scores: Partial<Record<AssistantLangCode, number>> = {};
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0900 && cp <= 0x097f) scores.hi = (scores.hi ?? 0) + 1;
    else if (cp >= 0x0980 && cp <= 0x09ff) scores.bn = (scores.bn ?? 0) + 1;
    else if (cp >= 0x0a80 && cp <= 0x0aff) scores.gu = (scores.gu ?? 0) + 1;
    else if (cp >= 0x0a00 && cp <= 0x0a7f) scores.pa = (scores.pa ?? 0) + 1;
    else if (cp >= 0x0b00 && cp <= 0x0b7f) scores.or = (scores.or ?? 0) + 1;
    else if (cp >= 0x0b80 && cp <= 0x0bff) scores.ta = (scores.ta ?? 0) + 1;
    else if (cp >= 0x0c00 && cp <= 0x0c7f) scores.te = (scores.te ?? 0) + 1;
    else if (cp >= 0x0c80 && cp <= 0x0cff) scores.kn = (scores.kn ?? 0) + 1;
    else if (cp >= 0x0d00 && cp <= 0x0d7f) scores.ml = (scores.ml ?? 0) + 1;
    else if (cp >= 0x0600 && cp <= 0x06ff) scores.ur = (scores.ur ?? 0) + 1;
    else if (/[a-zA-Z]/.test(ch)) scores.en = (scores.en ?? 0) + 1;
  }
  return scores;
}

const MARATHI_HINTS = /\b(aani|kay|mala|tumhi|nahi|ahe|hot|kar|sang)\b/i;
const HINGLISH_HINTS =
  /\b(aaj|aaya|aaye|aapka|apka|batao|bata|bhej|boliye|bolo|chahiye|dikhao|hai|haan|ji|kaise|karo|karoon|kya|kis|kiska|kaun|kitne|likho|madad|main|mera|meri|mujhe|nahi|padho|pooch|pucho|suno|sunao|theek|tumhara|tumhari|udhar|vah|woh|yaad|baje|meeting|naam|message|msg|call|chat|sunao|kholo|band|on|off)\b/i;

/** Detect primary language from user utterance (script + common words). */
export function detectAssistantLanguage(text: string, hint?: string | null): AssistantLangCode {
  if (hint?.trim()) return normalizeLangCode(hint);

  const scores = scriptScore(text);
  let best: AssistantLangCode = "en";
  let bestScore = 0;
  for (const [lang, score] of Object.entries(scores) as Array<[AssistantLangCode, number]>) {
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }

  if (bestScore === 0) {
    if (/^[a-zA-Z0-9\s.,!?'"-]+$/.test(text.trim())) return "en";
    if (HINGLISH_HINTS.test(text)) return "en";
    return "en";
  }

  if (best === "en" && HINGLISH_HINTS.test(text)) return "en";

  if (best === "hi" && MARATHI_HINTS.test(text)) return "mr";
  if (best === "bn" && /\b(apuni|kene|kio|noi)\b/i.test(text)) return "as";

  return best;
}

export function firstName(userName: string): string {
  return (userName ?? "").trim().split(/\s+/)[0] || "User";
}
