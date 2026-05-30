import type { PlannedAction } from "./assistantIntents";
import { intentToPlanned, parseAssistantIntent } from "./assistantIntents";
import { useOpenAiAssistant } from "./assistantDbAnswer";
import type { AssistantUserContext } from "./assistantExecutor";
import type { AssistantLangCode } from "./assistantLanguages";
import { firstName, INDIAN_LANGUAGE_LABELS } from "./assistantLanguages";
import { VIDEH_PRODUCT_KNOWLEDGE } from "./assistantKnowledge";

const ACTION_SCHEMA = `{
  "intent": "send_message|messages_today|messages_from|last_message_from|unread_count|important_messages|chat_summary|list_contacts|mark_read|mark_all_read|call_contact|open_chat|search_messages|recent_calls|missed_calls|group_message_stats|list_broadcasts|send_broadcast|khata_summary|khata_add|project_qa|reply|unknown",
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
    || /\b(app|messenger|feature|setting|settings|privacy|notification|theme|status|wallpaper)\b/i.test(n)
      && /\b(kya|kaise|how|what|kahan|where|kaun|kab)\b/.test(n)
    || /\b(kaise\s+(?:kare|karu|on|off|enable|change|set)|setting\s+kaise)\b/i.test(n)
    || /\b(kis\s+setting|kahan\s+se|menu\s+mein)\b/i.test(n)
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
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
- recent_calls, missed_calls (who missed calls today / recently)
- group_message_stats: how many messages in which group today
- list_broadcasts, send_broadcast
- khata_summary, khata_add (amount in rupees)
- project_qa: ANY question about Videh features, settings path, how-to (not secrets)
- reply: open-ended answer using user's real chat/call data when question is informational

IMPORTANT: contactName must match one of the user's actual chat names when possible — every user has different names; never invent or assume example names.

Users may ask unlimited natural questions (Hindi/English): who messaged today, missed calls, group activity, how to change a setting, etc. Pick the best intent.

Never plan: sexual/illegal/terror content, or revealing API keys/source code/passwords.
Never use the word "database" in speak text — say "your chats" or "your Videh account" instead.`,
          },
          { role: "user", content: text },
        ],
        max_tokens: 180,
      }),
    });
    clearTimeout(timeout);
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
  const ruleIntent = parseAssistantIntent(text);
  if (ruleIntent.type !== "unknown") {
    return intentToPlanned(ruleIntent);
  }

  if (!useOpenAiAssistant()) {
    if (isLikelyProjectQuestion(text)) {
      return { intent: "project_qa" };
    }
    return { intent: "unknown" };
  }

  const aiPlan = await planAssistantAction(text, ctx, lang);
  if (aiPlan && aiPlan.intent !== "reply" && aiPlan.intent !== "unknown" && aiPlan.intent !== "project_qa") {
    return aiPlan;
  }
  if (aiPlan?.intent === "reply" && aiPlan.speak) {
    return aiPlan;
  }
  if (aiPlan?.speak && (aiPlan.intent === "project_qa" || isLikelyProjectQuestion(text))) {
    return { intent: "project_qa", speak: aiPlan.speak };
  }
  return { intent: "project_qa" };
}
