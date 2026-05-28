import type { AssistantLangCode } from "./assistantLanguages";

function timeGreeting(lang: AssistantLangCode): string {
  const hour = new Date().getHours();
  const morning = hour >= 5 && hour < 12;
  const afternoon = hour >= 12 && hour < 17;
  const evening = hour >= 17 && hour < 21;
  const map: Partial<Record<AssistantLangCode, [string, string, string, string]>> = {
    hi: ["सुप्रभात", "नमस्कार", "शुभ संध्या", "शुभ रात्रि"],
    en: ["Good morning", "Good afternoon", "Good evening", "Good night"],
    ta: ["காலை வணக்கம்", "வணக்கம்", "மாலை வணக்கம்", "இரவு வணக்கம்"],
    te: ["శుభోదయం", "నమస్కారం", "శుభ సాయంత్రం", "శుభ రాత్రి"],
    bn: ["সুপ্রভাত", "নমস্কার", "শুভ সন্ধ্যা", "শুভ রাত্রি"],
  };
  const row = map[lang] ?? map.hi!;
  if (morning) return row[0];
  if (afternoon) return row[1];
  if (evening) return row[2];
  return row[3];
}

export function localActivationGreeting(userName?: string | null, lang: AssistantLangCode = "hi"): string {
  const first = (userName ?? "").trim().split(/\s+/)[0] || "User";
  const tg = timeGreeting(lang);
  if (lang === "en") {
    return `${tg}, ${first}. I'm listening — call, message, or ask anything.`;
  }
  return `${tg}, ${first} ji. Boliye — call, message, ya kuch bhi poochhiye.`;
}
