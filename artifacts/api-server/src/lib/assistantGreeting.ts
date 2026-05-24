import type { AssistantLangCode } from "./assistantLanguages";
import { firstName } from "./assistantLanguages";

function timeGreeting(lang: AssistantLangCode, now = new Date()): string {
  const hour = now.getHours();
  const morning = hour >= 5 && hour < 12;
  const afternoon = hour >= 12 && hour < 17;
  const evening = hour >= 17 && hour < 21;

  const map: Partial<Record<AssistantLangCode, [string, string, string, string]>> = {
    hi: ["सुप्रभात", "नमस्कार", "शुभ संध्या", "शुभ रात्रि"],
    en: ["Good morning", "Good afternoon", "Good evening", "Good night"],
    ta: ["காலை வணக்கம்", "வணக்கம்", "மாலை வணக்கம்", "இரவு வணக்கம்"],
    te: ["శుభోదయం", "నమస్కారం", "శుభ సాయంత్రం", "శుభ రాత్రి"],
    bn: ["সুপ্রভাত", "নমস্কার", "শুভ সন্ধ্যা", "শুভ রাত্রি"],
    mr: ["सुप्रभात", "नमस्कार", "शुभ संध्या", "शुभ रात्री"],
    gu: ["સુપ્રભાત", "નમસ્તે", "શુભ સાંજ", "શુભ રાત્રિ"],
    kn: ["ಶುಭೋದಯ", "ನಮಸ್ಕಾರ", "ಶುಭ ಸಂಜೆ", "ಶುಭ ರಾತ್ರಿ"],
    ml: ["സുപ്രഭാതം", "നമസ്കാരം", "ശുഭ സന്ധ്യ", "ശുഭ രാത്രി"],
    pa: ["ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "ਨਮਸਕਾਰ", "ਸ਼ੁਭ ਸੰਧਿਆ", "ਸ਼ੁਭ ਰਾਤ"],
    ur: ["صبح بخیر", "السلام علیکم", "شام بخیر", "شب بخیر"],
  };

  const row = map[lang] ?? map.hi!;
  if (morning) return row[0];
  if (afternoon) return row[1];
  if (evening) return row[2];
  return row[3];
}

const SERVICE_LINE: Partial<Record<AssistantLangCode, string>> = {
  hi: "Videh aapki seva mein hazir hai. Jo aap bolenge, main wahi karunga — apni bhasha mein.",
  en: "Videh is ready to serve you. Say what you need — I will reply in your language.",
  ta: "Videh உங்கள் சேவையில் தயார். நீங்கள் சொல்வதை நான் செய்வேன் — உங்கள் மொழியில்.",
  te: "Videh మీ సేవలో సిద్ధంగా ఉంది. మీరు చెప్పినది చేస్తాను — మీ భాషలో.",
  bn: "Videh আপনার সেবায় প্রস্তুত। আপনি যা বলবেন, আমি করব — আপনার ভাষায়।",
  mr: "Videh tumchya sevaat tayar aahe. Tumhi mhanal te me karin — tumchya bhashhet.",
  gu: "Videh તમારી સેવામાં તૈયાર છે. તમે જે કહેશો તે હું કરીશ — તમારી ભાષામાં.",
  kn: "Videh ನಿಮ್ಮ ಸೇವೆಯಲ್ಲಿ ಸಿದ್ಧವಾಗಿದೆ. ನೀವು ಹೇಳಿದ್ದನ್ನು ಮಾಡುತ್ತೇನೆ — ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ.",
  ml: "Videh നിങ്ങളുടെ സേവനത്തിൽ തയ്യാർ. നിങ്ങൾ പറയുന്നത് ചെയ്യും — നിങ്ങളുടെ ഭാഷയിൽ.",
  pa: "Videh ਤੁਹਾਡੀ ਸੇਵਾ ਵਿੱਚ ਤਿਆਰ ਹੈ। ਜੋ ਤੁਸੀਂ ਕਹੋਗੇ, ਮੈਂ ਕਰਾਂਗਾ — ਤੁਹਾਡੀ ਭਾਸ਼ਾ ਵਿੱਚ।",
  ur: "Videh آپ کی خدمت میں حاضر ہے۔ جو آپ کہیں گے، میں کروں گا — آپ کی زبان میں۔",
};

export function buildActivationGreeting(userName: string, lang: AssistantLangCode = "hi"): string {
  const first = firstName(userName);
  const tg = timeGreeting(lang);
  const line = SERVICE_LINE[lang] ?? SERVICE_LINE.hi!;
  if (lang === "en") return `${tg}, ${first}. ${line}`;
  return `${tg}, ${first} ji. ${line}`;
}

/** @deprecated use buildActivationGreeting with AssistantLangCode */
export function timeGreetingHindi(now = new Date()): string {
  return timeGreeting("hi", now);
}

export function timeGreetingEnglish(now = new Date()): string {
  return timeGreeting("en", now);
}
