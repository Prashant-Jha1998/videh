import type { AssistantLangCode } from "./assistantLanguages";

export type SafetyResult =
  | { safe: true }
  | { safe: false; category: "unsafe" | "secret" | "illegal" };

const UNSAFE_RE = [
  /\b(sex|sexy|porn|nude|nudity|naked|xxx|adult\s+content|erotic|orgasm|breast|penis|vagina)\b/i,
  /\b(terror|terrorist|terrorism|bomb\s+ban|blast\s+kar|isis|jihad\s+attack|suicide\s+bomb)\b/i,
  /\b(rape|molest|child\s+porn|pedophil|minor\s+sex)\b/i,
  /\b(kill\s+someone|murder\s+plan|how\s+to\s+make\s+bomb|gun\s+bana)\b/i,
  /\b(drug\s+deal|heroin\s+bech|cocaine\s+supply)\b/i,
  /(?:sex|nude|nangi|nanga|chud|gandi|ashlil)/i,
  /(?:atank|aatank|bomb|hamla|hinsa\s+fail)/i,
];

const SECRET_RE = [
  /\b(source\s*code|github\s+repo|git\s*repo)\b/i,
  /\b(api\s*key|secret\s*key|private\s*key|access\s*token|auth\s*token)\b/i,
  /\b(database\s*password|db\s*password|postgres\s*password|neon\s*key)\b/i,
  /\b(server\s*ip|ec2\s*password|ssh\s*key|\.env\s*file|environment\s*variable)\b/i,
  /\b(openai\s*key|razorpay\s*secret|firebase\s*key|session\s*secret)\b/i,
  /(?:source\s*code|sourc\s*code|api\s*key|secret\s*key|password\s*kya|code\s*dikhao|repo\s*link)/i,
  /(?:database\s*ka\s*password|server\s*ka\s*password|\.env\s*kya\s*hai)/i,
];

export function evaluateAssistantSafety(text: string): SafetyResult {
  const n = text.trim();
  if (!n) return { safe: true };

  for (const re of SECRET_RE) {
    if (re.test(n)) return { safe: false, category: "secret" };
  }
  for (const re of UNSAFE_RE) {
    if (re.test(n)) return { safe: false, category: "unsafe" };
  }
  if (/\b(illegal|unlawful)\b.*\b(how|kaise)\b/i.test(n)) {
    return { safe: false, category: "illegal" };
  }
  return { safe: true };
}

const REFUSAL: Partial<Record<AssistantLangCode, Record<"unsafe" | "secret" | "illegal", string>>> = {
  hi: {
    unsafe: "Maaf kijiye, main aisi baaton par jawab nahi de sakta. Main sirf Videh se judi madad kar sakta hoon.",
    secret: "Is baare mein mujhe jaankari nahi hai. Main aapki messaging aur Videh features mein hi madad kar sakta hoon.",
    illegal: "Main galat ya illegal kaam mein madad nahi kar sakta. Kripya koi sahi Videh command bolein.",
  },
  en: {
    unsafe: "Sorry, I cannot help with that topic. I can only assist with Videh features.",
    secret: "I don't have information about that. I can help with your chats and Videh app features only.",
    illegal: "I cannot help with illegal activities. Please ask something related to Videh.",
  },
  ta: {
    unsafe: "மன்னிக்கவும், இதற்கு நான் பதில் சொல்ல முடியாது. Videh தொடர்பான உதவி மட்டும் செய்வேன்.",
    secret: "இதைப் பற்றி எனக்குத் தெரியாது. உங்கள் chats மற்றும் Videh features-ல் மட்டும் உதவுவேன்.",
    illegal: "illegal செயல்களுக்கு உதவ முடியாது. Videh தொடர்பான கேள்வி கேளுங்கள்.",
  },
  te: {
    unsafe: "క్షమించండి, దీనికి నేను సమాధానం చెప్పలేను. Videh features లో మాత్రమే సహాయం చేస్తాను.",
    secret: "దీని గురించి నాకు సమాచారం లేదు. మీ chats మరియు Videh features లో మాత్రమే సహాయం.",
    illegal: "illegal పనులకు సహాయం చేయలేను. Videh గురించి అడగండి.",
  },
  bn: {
    unsafe: "দুঃখিত, এ বিষয়ে আমি উত্তর দিতে পারি না। আমি শুধু Videh-এ সাহায্য করতে পারi।",
    secret: "এটা সম্পর্কে আমার কোনো তথ্য নেই। আমি chats এবং Videh features-এ সাহায্য করি।",
    illegal: "অবৈধ কাজে সাহায্য করতে পারি না। Videh সম্পর্কে জিজ্ঞাসা করুন।",
  },
};

export function safetyRefusal(
  lang: AssistantLangCode,
  category: "unsafe" | "secret" | "illegal",
): string {
  return REFUSAL[lang]?.[category]
    ?? REFUSAL.en?.[category]
    ?? "Sorry, I cannot help with that.";
}
