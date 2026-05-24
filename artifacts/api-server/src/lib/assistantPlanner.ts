import type { PlannedAction } from "./assistantIntents";
import { intentToPlanned, parseAssistantIntent } from "./assistantIntents";
import type { AssistantUserContext } from "./assistantExecutor";

const ACTION_SCHEMA = `{
  "intent": "send_message|messages_today|messages_from|last_message_from|unread_count|important_messages|chat_summary|list_contacts|reply",
  "contactName": "optional string",
  "messageText": "optional string",
  "speak": "short Hindi spoken reply using user's first name"
}`;

export async function planAssistantAction(
  text: string,
  ctx: AssistantUserContext,
  locale: "hi" | "en",
): Promise<PlannedAction | null> {
  const openAiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!openAiKey) return null;

  const firstName = ctx.userName.split(/\s+/)[0] || ctx.userName;
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
            content: `You are Videh voice assistant planner for Indian users. Logged-in user name: ${ctx.userName} (call them ${firstName} ji in Hindi replies).
Contacts: ${ctx.contactNames.join(", ") || "none"}.
Groups: ${ctx.groupNames.join(", ") || "none"}.
Map user voice command to ONE action. Always respond valid JSON only matching: ${ACTION_SCHEMA}
Rules:
- send_message when user asks to message/text someone
- messages_today when user asks who messaged today / aaj kahan se message aaya
- messages_from / last_message_from for reading someone's messages
- important_messages for unread/important
- chat_summary for summary of all chats
- list_contacts for listing chats
- reply with helpful speak in Hindi-English mix, always mention user first name for personal touch`,
          },
          { role: "user", content: text },
        ],
        max_tokens: 200,
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
  locale: "hi" | "en",
): Promise<PlannedAction> {
  const aiPlan = await planAssistantAction(text, ctx, locale);
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

  if (aiPlan?.speak) return aiPlan;

  return { intent: "unknown", speak: undefined };
}
