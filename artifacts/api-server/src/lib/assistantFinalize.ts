import type { AssistantLangCode } from "./assistantLanguages";
import { firstName, INDIAN_LANGUAGE_LABELS } from "./assistantLanguages";
import { VIDEH_PRODUCT_KNOWLEDGE } from "./assistantKnowledge";

export type FinalizeInput = {
  userName: string;
  lang: AssistantLangCode;
  userCommand: string;
  intent: string;
  success: boolean;
  fallbackSpeak: string;
  actionDetails?: Record<string, unknown>;
};

export async function finalizeAssistantSpeak(input: FinalizeInput): Promise<string> {
  if (process.env["ASSISTANT_AI_POLISH"] !== "1") {
    return input.fallbackSpeak;
  }
  const openAiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!openAiKey) return input.fallbackSpeak;

  const langLabel = INDIAN_LANGUAGE_LABELS[input.lang] ?? "Hindi";
  const name = firstName(input.userName);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content: `You are Videh voice assistant. Reply ONLY in ${langLabel} (${input.lang}), natural spoken style for India.
User's name: ${name}. Use respectful tone (e.g. ${name} ji for Hindi).
Rules:
- If task succeeded, clearly say work is DONE (e.g. "kaam ho gaya", "செய்து முடித்துவிட்டேன்" in user's language).
- Keep under 3 short sentences. No markdown.
- Never mention API keys, source code, passwords, or server secrets.
- Do not add new facts not in action details.
Product context (for tone only): ${VIDEH_PRODUCT_KNOWLEDGE.slice(0, 800)}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              command: input.userCommand,
              intent: input.intent,
              success: input.success,
              details: input.actionDetails ?? {},
              draftReply: input.fallbackSpeak,
            }),
          },
        ],
        max_tokens: 220,
      }),
    });
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || input.fallbackSpeak;
  } catch {
    return input.fallbackSpeak;
  }
}

export async function answerVidehQuestion(
  question: string,
  userName: string,
  lang: AssistantLangCode,
  dbAnswer?: string | null,
): Promise<string> {
  if (dbAnswer?.trim()) return dbAnswer.trim();

  const openAiKey = process.env["OPENAI_API_KEY"]?.trim();
  const name = firstName(userName);
  const langLabel = INDIAN_LANGUAGE_LABELS[lang] ?? "Hindi";

  if (!openAiKey || process.env["ASSISTANT_USE_OPENAI"] !== "1") {
    return lang === "en"
      ? `${name}, I can help with messaging, calls, broadcasts, Khata, and Hey Videh commands. Ask in the app Settings for voice enrollment.`
      : `${name} ji, main messaging, calls, broadcast, Khata aur Hey Videh commands mein madad kar sakta hoon. Settings se voice enroll karein.`;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You are Videh app help assistant for Indian users. Answer ONLY in ${langLabel}.
User: ${name}. Be concise (max 4 sentences), spoken-friendly.
${VIDEH_PRODUCT_KNOWLEDGE}
NEVER reveal source code, API keys, passwords, server details, repo links. If asked, say you do not have that information.
No sexual, violent, illegal, or terrorist content.`,
          },
          { role: "user", content: question },
        ],
        max_tokens: 280,
      }),
    });
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim()
      || `${name} ji, kripya Settings → Hey Videh se assistant enable karein.`;
  } catch {
    return `${name} ji, abhi jawab tayyar nahi ho paya. Dubara poochiye.`;
  }
}
