import type { PlannedAction } from "./assistantIntents";
import { intentToPlanned, parseAssistantIntent } from "./assistantIntents";
import type { AssistantUserContext } from "./assistantExecutor";
import type { AssistantLangCode } from "./assistantLanguages";
import { firstName, INDIAN_LANGUAGE_LABELS } from "./assistantLanguages";
import { VIDEH_PRODUCT_KNOWLEDGE } from "./assistantKnowledge";

const ACTION_SCHEMA = `{
  "intent": "send_message|messages_today|messages_from|last_message_from|unread_count|important_messages|chat_summary|list_contacts|mark_read|mark_all_read|call_contact|open_chat|search_messages|recent_calls|list_broadcasts|send_broadcast|khata_summary|khata_add|project_qa|reply|unknown",
  "contactName": "ANY contact/group name from user's chat list — not a fixed example name",
  "messageText": "string optional",
  "broadcastListName": "string optional",
  "callType": "audio|video optional",
  "searchQuery": "string optional",
  "amount": "number optional for khata",
  "note": "string optional",
  "speak": "string optional — reply/unknown only, in user's language"
}`;

function isLikelyProjectQuestion(text: string): boolean {
  const n = text.toLowerCase();
  return (
    /\b(videh|hey\s+videh|assistant|khata|broadcast|business\s+api|developer\s+portal)\b/i.test(n)
    || /\b(app|messenger|feature|setting|call|group)\b/i.test(n) && /\b(kya|kaise|how|what|kahan|where)\b/i.test(n)
  );
}

export async function planAssistantAction(
  text: string,
  ctx: AssistantUserContext,
  lang: AssistantLangCode,
): Promise<PlannedAction | null> {
  const openAiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!openAiKey) return null;

  const first = firstName(ctx.userName);
  const langLabel = INDIAN_LANGUAGE_LABELS[lang];
  const allChats = ctx.chats.map((c) => c.displayName).join(", ");
  const broadcasts = ctx.broadcastLists.map((b) => b.name).join(", ");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are Videh AI planner — India's advanced voice assistant inside Videh Messenger.
User: ${ctx.userName} (${first}). JSON only: ${ACTION_SCHEMA}
Language for speak: ${langLabel} (${lang}).

User's REAL chats (use exact or closest name for contactName — can be ANY person or group):
${allChats || "none yet"}

Broadcast lists: ${broadcasts || "none"}

${VIDEH_PRODUCT_KNOWLEDGE}

You can plan ANY of these real actions:
- send_message: message ANY contact or group by their actual name
- call_contact: voice/video call ANY contact (callType audio or video)
- open_chat: open a chat
- messages_today, messages_from, last_message_from, unread_count, important_messages, chat_summary
- list_contacts: list all chats
- mark_read / mark_all_read
- search_messages: search text in chats
- recent_calls, list_broadcasts, send_broadcast
- khata_summary, khata_add (amount in rupees)
- project_qa: Videh app help (not secrets)
- reply: polite answer or refusal

IMPORTANT: contactName must match one of the user's actual chat names when possible. Never hardcode example names like Rahul — use who the user said.

Never plan: sexual/illegal/terror content, or revealing API keys/source code/passwords.`,
          },
          { role: "user", content: text },
        ],
        max_tokens: 320,
      }),
    });
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlannedAction;
    if (!parsed.intent) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function resolveAssistantPlan(
  text: string,
  ctx: AssistantUserContext,
  lang: AssistantLangCode,
): Promise<PlannedAction> {
  const aiPlan = await planAssistantAction(text, ctx, lang);

  if (aiPlan?.intent === "project_qa") {
    return { intent: "project_qa", speak: aiPlan.speak };
  }

  if (aiPlan && aiPlan.intent !== "reply" && aiPlan.intent !== "unknown") {
    return aiPlan;
  }

  if (aiPlan?.intent === "reply" && aiPlan.speak) {
    return aiPlan;
  }

  const ruleIntent = parseAssistantIntent(text);
  if (ruleIntent.type !== "unknown") {
    return intentToPlanned(ruleIntent);
  }

  if (isLikelyProjectQuestion(text)) {
    return { intent: "project_qa" };
  }

  if (aiPlan?.speak) return aiPlan;

  return { intent: "unknown" };
}
