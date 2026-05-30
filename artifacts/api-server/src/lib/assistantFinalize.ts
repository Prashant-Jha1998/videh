import type { AssistantLangCode } from "./assistantLanguages";
import { firstName, INDIAN_LANGUAGE_LABELS } from "./assistantLanguages";
import { databaseAssistantFallback } from "./assistantDbAnswer";
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

  if (!openAiKey) {
    if (lang === "en") {
      return `${name}, I am Videh assistant. Ask anything about your chats, calls, contacts, khata, status, or how to use the app — for example who messaged last or call a contact by name.`;
    }
    if (lang === "hi") {
      return `${name} ji, main Videh assistant hoon. Chats, calls, contacts, khata, status ya app ke baare mein kuch bhi poochhiye — jaise last message kis ka aaya ya kisi ko call karo.`;
    }
    return `${name}, ask about Videh chats, calls, or app features in your language.`;
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
            content: `You are Videh voice assistant for Indian users. Answer ONLY in ${langLabel} — match the language of the user's question.
User: ${name}. Be concise (max 4 sentences), spoken-friendly, like WhatsApp voice replies.
Use the user's real Videh app data when the question is about their chats/calls; never say "database" or technical backend words.
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
    const text = data.choices?.[0]?.message?.content?.trim();
    if (text) return text;
    return databaseAssistantFallback(lang, userName);
  } catch {
    return databaseAssistantFallback(lang, userName);
  }
}
