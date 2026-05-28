import type { AssistantUserContext } from "./assistantExecutor";
import type { AssistantLangCode } from "./assistantLanguages";
import { firstName, INDIAN_LANGUAGE_LABELS } from "./assistantLanguages";
import { parseAssistantIntent, intentToPlanned } from "./assistantIntents";
import { executeAssistantAction } from "./assistantExecutor";
import { query } from "./db";

function isEn(lang: AssistantLangCode): boolean {
  return lang === "en";
}

/** Pattern-based app help — no external AI, from Videh product docs. */
function answerSettingsHelp(question: string, lang: AssistantLangCode, name: string): string | null {
  const n = question.toLowerCase();

  if (/(hey\s+videh|voice\s+assistant|assistant\s+on|assistant\s+enable)/.test(n) && /(kaise|how|on\s+kare|enable|chal)/.test(n)) {
    return isEn(lang)
      ? `${name}, open Settings → Hey Videh, turn it on, complete voice setup, then say "Hey Videh" and your command.`
      : `${name} ji, Settings → Hey Videh kholiye, enable kijiye, voice setup kijiye, phir "Hey Videh" bol kar command dijiye.`;
  }
  if (/(theme|dark\s+mode|colour|color)/.test(n) && /(kaise|how|change|badal)/.test(n)) {
    return isEn(lang)
      ? `${name}, go to Settings → App Theme and pick your theme.`
      : `${name} ji, Settings → App Theme se theme badal sakte hain.`;
  }
  if (/(privacy|last\s+seen|online\s+status)/.test(n) && /(kaise|how|hide|badal)/.test(n)) {
    return isEn(lang)
      ? `${name}, open Settings → Privacy to control last seen and online.`
      : `${name} ji, Settings → Privacy se last seen aur online control karein.`;
  }
  if (/(notification|alert)/.test(n) && /(kaise|how|band|off|on)/.test(n)) {
    return isEn(lang)
      ? `${name}, open Settings → Notifications to manage alerts.`
      : `${name} ji, Settings → Notifications se alerts manage karein.`;
  }
  if (/(khata|udhar|hisab)/.test(n) && /(kaise|how|use|kya\s+hai)/.test(n)) {
    return isEn(lang)
      ? `${name}, open any chat → menu → Khata to track udhar/credit. You can also say: "Ramesh ka khata batao".`
      : `${name} ji, kisi chat mein menu se Khata kholiye — udhar/credit likh sakte hain. Ya bolein: "Ramesh ka khata batao".`;
  }
  if (/(broadcast)/.test(n) && /(kaise|how|bhej|send|list)/.test(n)) {
    return isEn(lang)
      ? `${name}, Settings or Chats → Broadcast lists to create lists. Say "meri broadcast list" to hear them.`
      : `${name} ji, Broadcast lists se ek saath kai logon ko message bhej sakte hain. Bolein: "meri broadcast list sunao".`;
  }
  if (/(status|story)/.test(n) && /(kaise|how|lagao|post|daal)/.test(n)) {
    return isEn(lang)
      ? `${name}, open the Status tab and tap to add photo, video, or text status.`
      : `${name} ji, Status tab khol kar photo, video ya text status laga sakte hain.`;
  }
  if (/(missed\s+call|call\s+miss)/.test(n) && /(kahan|where|kaise|how)/.test(n)) {
    return isEn(lang)
      ? `${name}, check the Calls tab, or ask me: "kis ka call miss hua".`
      : `${name} ji, Calls tab dekhein, ya mujhse poochhiye: "kis ka call miss hua".`;
  }
  return null;
}

async function buildUserSnapshot(userId: number): Promise<{
  unread: number;
  chats: number;
  missedToday: number;
  messagedToday: number;
}> {
  const [unreadR, chatsR, missedR, todayR] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS cnt FROM messages m
       JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
       LEFT JOIN message_status ms ON ms.message_id = m.id AND ms.user_id = $1
       WHERE m.sender_id != $1 AND m.is_deleted = FALSE
         AND (ms.status IS NULL OR ms.status != 'read')`,
      [userId],
    ),
    query(
      `SELECT COUNT(DISTINCT cm.chat_id)::int AS cnt FROM chat_members cm WHERE cm.user_id = $1`,
      [userId],
    ),
    query(
      `SELECT COUNT(*)::int AS cnt FROM calls c
       WHERE (c.caller_id = $1 OR c.callee_id = $1)
         AND c.status = 'missed'
         AND c.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata')`,
      [userId],
    ),
    query(
      `SELECT COUNT(DISTINCT m.chat_id)::int AS cnt FROM messages m
       JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = $1
       WHERE m.sender_id != $1 AND m.is_deleted = FALSE
         AND m.created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Kolkata')`,
      [userId],
    ),
  ]);
  return {
    unread: Number(unreadR.rows[0]?.cnt ?? 0),
    chats: Number(chatsR.rows[0]?.cnt ?? 0),
    missedToday: Number(missedR.rows[0]?.cnt ?? 0),
    messagedToday: Number(todayR.rows[0]?.cnt ?? 0),
  };
}

function answerAccountSnapshot(
  snap: Awaited<ReturnType<typeof buildUserSnapshot>>,
  lang: AssistantLangCode,
  name: string,
): string {
  if (isEn(lang)) {
    return `${name}, your snapshot: ${snap.chats} chats, ${snap.unread} unread messages, ${snap.messagedToday} people messaged you today, ${snap.missedToday} missed calls today.`;
  }
  return `${name} ji, aapka hisaab: ${snap.chats} chats, ${snap.unread} unread messages, aaj ${snap.messagedToday} logon ne message kiya, aaj ${snap.missedToday} missed calls.`;
}

/**
 * Videh's own assistant: rules → SQL → polished spoken reply.
 * Returns null if this question should fall through to optional OpenAI.
 */
export async function answerFromDatabase(
  question: string,
  ctx: AssistantUserContext,
  lang: AssistantLangCode,
): Promise<string | null> {
  const name = firstName(ctx.userName);
  const trimmed = question.trim();
  if (!trimmed) return null;

  const help = answerSettingsHelp(trimmed, lang, name);
  if (help) return help;

  const n = trimmed.toLowerCase();
  if (
    /(mera\s+account|account\s+summary|overview|snapshot|mera\s+data|my\s+stats)/.test(n)
    || /(kitni\s+chat|kitne\s+unread|overall)/.test(n)
  ) {
    const snap = await buildUserSnapshot(ctx.userId);
    return answerAccountSnapshot(snap, lang, name);
  }

  const ruleIntent = parseAssistantIntent(trimmed);
  if (ruleIntent.type !== "unknown") {
    const plan = intentToPlanned(ruleIntent);
    const result = await executeAssistantAction(ctx, plan, lang);
    return result.speak;
  }

  return null;
}

export function databaseAssistantFallback(lang: AssistantLangCode, userName: string): string {
  const name = firstName(userName);
  const label = INDIAN_LANGUAGE_LABELS[lang] ?? "Hindi";
  if (isEn(lang)) {
    return `${name}, I read your Videh data directly (${label}). Try: who messaged today, missed calls, unread count, call someone by name, or Khata summary.`;
  }
  return `${name} ji, main aapka Videh data seedha database se padhta hoon (${label}). Bolein: aaj kis ka message aaya, missed call, unread kitne, kisi ko call karo, ya khata batao.`;
}

export function useOpenAiAssistant(): boolean {
  return process.env["ASSISTANT_USE_OPENAI"] === "1";
}
