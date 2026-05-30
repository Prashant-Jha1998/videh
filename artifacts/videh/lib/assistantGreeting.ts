import type { AssistantLangCode } from "./assistantLanguages";

/** Instant reply right after "Hey" / "Hey Videh" — WhatsApp-style. */
export function wakeListenPrompt(lang: AssistantLangCode = "en"): string {
  const map: Partial<Record<AssistantLangCode, string>> = {
    en: "Yes?",
    hi: "हाँ, बताइए।",
    bn: "হ্যাঁ, বলুন।",
    ta: "ஆமா, சொல்லுங்கள்।",
    te: "అవును, చెప్పండి।",
    mr: "हो, सांगा।",
    gu: "હા, કહો।",
    kn: "ಹೌದು, ಹೇಳಿ।",
    ml: "അതെ, പറയൂ।",
    pa: "ਹਾਂ, ਦੱਸੋ।",
    ur: "جی ہاں، بتائیے۔",
  };
  return map[lang] ?? map.en ?? "Yes?";
}

export function localActivationGreeting(userName?: string | null, lang: AssistantLangCode = "en"): string {
  return wakeListenPrompt(lang);
}
