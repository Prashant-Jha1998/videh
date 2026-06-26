import type { AssistantUserContext } from "./assistantExecutor";
import type { AssistantLangCode } from "./assistantLanguages";
import { firstName } from "./assistantLanguages";
import { parseAssistantIntent, intentToPlanned } from "./assistantIntents";
import { executeAssistantAction } from "./assistantExecutor";
import { query } from "./db";

function isEn(_lang: AssistantLangCode): boolean {
  return true;
}

/** Identity & general Videh questions — no OpenAI required. */
function answerConversationalQuestion(question: string, lang: AssistantLangCode, name: string): string | null {
  const n = question.toLowerCase();

  if (
    /(tumhara|aapka|apka|tera|your)\s+(?:naam|name)/.test(n)
    || /naam\s+kya\s+hai/.test(n)
    || /who\s+are\s+you/.test(n)
    || /what\s+(?:is|'s)\s+your\s+name/.test(n)
    || /kaun\s+ho\s+tum/.test(n)
    || /aap\s+kaun\s+ho/.test(n)
  ) {
    return isEn(lang)
      ? `${name}, I am Videh — your voice assistant in Videh Messenger. I help with chats, calls, status, khata, broadcasts, and settings.`
      : `${name} ji, main Videh hoon — Videh Messenger ka voice assistant. Main aapke messages, calls, status, khata, broadcast aur settings mein madad karta hoon.`;
  }

  if (
    /(?:videh|hey\s+videh)\s+(?:kya\s+hai|kya\s+he|what\s+is)/.test(n)
    || /what\s+is\s+videh/.test(n)
    || /videh\s+app\s+kya/.test(n)
  ) {
    return isEn(lang)
      ? `${name}, Videh is a secure messenger for India — chats, voice and video calls, status, groups, khata, broadcasts, and Hey Videh voice assistant.`
      : `${name} ji, Videh ek secure messenger hai — chat, voice/video call, status, groups, khata, broadcast, aur Hey Videh voice assistant ke saath.`;
  }

  if (/(?:kya\s+kar\s+sakte|what\s+can\s+you\s+do|help\s+kya)/.test(n)) {
    return isEn(lang)
      ? `${name}, you can ask: who messaged today, who called last, unread count, send a message to any contact, open a chat, khata summary, or how to use any Videh feature.`
      : `${name} ji, aap pooch sakte hain: aaj kis ka message aaya, last call kis ka tha, kitne unread, kisi ko message bhejo, chat kholo, khata batao, ya koi Videh feature kaise use karein.`;
  }

  return null;
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
  if (/(schedule|scheduled)\s+message|message\s+schedule/.test(n)) {
    return isEn(lang)
      ? `${name}, open any chat → menu (⋮) → Schedule Message. Pick date and time, type your message, and Videh will send it automatically. You can view or cancel scheduled messages from the same screen.`
      : `${name} ji, kisi bhi chat mein menu (⋮) → Schedule Message. Date aur time chuniye, message likhiye — Videh us samay khud bhej dega. Wahi screen se scheduled messages dekh ya cancel kar sakte hain.`;
  }
  if (/(premium\s+sound|ringtone|notification\s+sound)/.test(n)) {
    return isEn(lang)
      ? `${name}, go to Settings → Notifications → Premium sounds. Set message tone, call ringtone, and per-chat sounds.`
      : `${name} ji, Settings → Notifications → Premium sounds se message tone, call ringtone aur per-chat sound set karein.`;
  }
  if (/(call\s+link|join\s+call)/.test(n)) {
    return isEn(lang)
      ? `${name}, during a call use the share link option, or create a call link from call settings. Others can join with the link.`
      : `${name} ji, call ke dauran link share kar sakte hain — link se log join kar sakte hain.`;
  }
  if (/(two\s+step|2\s*step|two-step)/.test(n)) {
    return isEn(lang)
      ? `${name}, open Settings → Account → Two-step verification to add a PIN for extra security.`
      : `${name} ji, Settings → Account → Two-step verification se extra PIN laga sakte hain.`;
  }
  if (/(sos|emergency)/.test(n)) {
    return isEn(lang)
      ? `${name}, open Settings → SOS to add emergency contacts and trigger SOS from the app.`
      : `${name} ji, Settings → SOS se emergency contacts add karein aur SOS trigger karein.`;
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

  const conversational = answerConversationalQuestion(trimmed, lang, name);
  if (conversational) return conversational;

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

const FALLBACK_BY_LANG: Partial<Record<AssistantLangCode, (name: string) => string>> = {
  en: (name) =>
    `${name}, try again in simple words — for example: who messaged today, last message from Rahul, call Monty, or how to schedule a message.`,
  hi: (name) =>
    `${name} ji, dubara simple shabdon mein boliye — jaise: aaj kis ka message aaya, Rahul ka last message, Monty ko call karo, ya schedule message kaise karein.`,
  pa: (name) =>
    `${name}, ਮੈਨੂੰ ਪੂਰੀ ਤਰ੍ਹਾਂ ਸਮਝ ਨਹੀਂ ਆਈ। ਸੁਨੇਹੇ, ਕਾਲਾਂ, ਜਾਂ ਕਿਸੇ contact ਨੂੰ ਕਾਲ ਕਰਨ ਲਈ ਬੋਲੋ।`,
  ta: (name) =>
    `${name}, முழுசா புரியவில்லை. செய்திகள், அழைப்புகள், அல்லது ஒரு contact-ஐ call செய்ய சொல்லுங்கள்.`,
  mr: (name) =>
    `${name}, मला पूर्ण समजले नाही. Messages, calls, किंवा contact ला call करण्यासाठी सांगा.`,
  bn: (name) =>
    `${name}, পুরোপুরি বুঝতে পারিনি। বার্তা, কল, বা কাউকে কল করতে বলুন।`,
  te: (name) =>
    `${name}, పూర్తిగా అర్థం కాలేదు. సందేశాలు, కాల్స్, లేదా contact కు call చెప్పండి.`,
};

export function databaseAssistantFallback(lang: AssistantLangCode, userName: string): string {
  const name = firstName(userName);
  const fn = FALLBACK_BY_LANG[lang] ?? FALLBACK_BY_LANG.en!;
  return fn(name);
}

export function useOpenAiAssistant(): boolean {
  return Boolean(process.env["OPENAI_API_KEY"]?.trim());
}
