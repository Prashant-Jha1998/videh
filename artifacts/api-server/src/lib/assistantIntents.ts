export type AssistantIntent =
  | { type: "greeting" }
  | { type: "send_message"; contactName: string; messageText: string }
  | { type: "messages_today" }
  | { type: "messages_from"; contactName: string }
  | { type: "last_message_from"; contactName: string }
  | { type: "unread_count" }
  | { type: "important_messages" }
  | { type: "chat_summary" }
  | { type: "list_contacts" }
  | { type: "mark_read"; contactName?: string }
  | { type: "mark_all_read" }
  | { type: "call_contact"; contactName: string; callType: "audio" | "video" }
  | { type: "open_chat"; contactName: string }
  | { type: "search_messages"; searchQuery: string }
  | { type: "recent_calls" }
  | { type: "missed_calls" }
  | { type: "group_message_stats" }
  | { type: "list_broadcasts" }
  | { type: "send_broadcast"; broadcastListName: string; messageText: string }
  | { type: "khata_summary"; contactName: string }
  | { type: "khata_add"; contactName: string; amount: number; note?: string }
  | { type: "unknown"; raw: string };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[।.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWakePrefix(raw: string): string {
  let t = raw.trim();
  const prefixes = [
    "hey videh",
    "he videh",
    "hay videh",
    "hi videh",
    "hello videh",
    "हे विदेह",
    "है विदेह",
    "हे वीडेह",
    "विदेह जी",
  ].sort((a, b) => b.length - a.length);
  for (const p of prefixes) {
    const re = new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[,\\s]*`, "i");
    t = t.replace(re, "").trim();
  }
  return t;
}

function extractContactName(fragment: string): string {
  return fragment
    .trim()
    .replace(/\s+ko\s*$/i, "")
    .replace(/\s+se\s*$/i, "")
    .replace(/\s+ka\s*$/i, "")
    .replace(/\s+ke\s*$/i, "")
    .replace(/\s+ki\s*$/i, "")
    .replace(/\s+ne\s*$/i, "")
    .trim();
}

export function parseAssistantIntent(text: string): AssistantIntent {
  const raw = stripWakePrefix(text.trim());
  const n = normalize(raw);
  if (!n) return { type: "unknown", raw: text };

  if (/^(hi|hello|namaste|namaskar|kaise ho|kya haal)$/.test(n)) {
    return { type: "greeting" };
  }

  const sendPatterns: Array<{ re: RegExp; contactIdx: number; msgIdx: number }> = [
    { re: /^(.+?)\s+ko\s+(?:message|msg|sms|text)?\s*(?:bhej|send|likh|type|bolo|bol)(?:o|na| do| dena| kar)?\s*(?:do|de|dena|kar)?\s*(?:ki|ke|ye|yeh|that|matlab)?\s*(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(?:message|msg|sms|text)\s+(?:bhej|send)(?:o|na| do)?\s+(.+?)\s+ko\s*(?:ki|ke|ye|yeh|that)?\s*(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(.+?)\s+(?:ko|ke)\s+(.+?)\s+(?:bhej|send)\s+(?:do|de|dena)/i, contactIdx: 1, msgIdx: 2 },
    { re: /^send\s+(?:a\s+)?message\s+to\s+(.+?)\s+(?:saying|that|ki)\s+(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^tell\s+(.+?)\s+(?:that|to)\s+(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(.+?)\s+ko\s+(.+)\s+bhej\s+do$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(.+?)\s+ko\s+(?:ye|yeh)\s+(?:bhej|message)\s+(?:do|kar)(?:o|na)?\s*(?:ki|ke)?\s*(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(.+?)\s+group\s+ko\s+(.+?)\s+(?:bhej|message)\s+(?:do|kar)/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(.+?)\s+ko\s+bol(?:o|na| do)?\s*(?:ki|ke|ye|yeh)?\s*(.+)$/i, contactIdx: 1, msgIdx: 2 },
  ];
  for (const { re, contactIdx, msgIdx } of sendPatterns) {
    const m = raw.match(re);
    if (m?.[contactIdx] && m?.[msgIdx]) {
      const contactName = extractContactName(m[contactIdx]);
      const messageText = m[msgIdx].trim();
      if (contactName.length >= 2 && messageText.length >= 2) {
        return { type: "send_message", contactName, messageText };
      }
    }
  }

  const callPatterns = [
    { re: /^(.+?)\s+ko\s+video\s+call\s+(?:karo|lagao|karna|kar|laga|mar)/i, video: true },
    { re: /^(.+?)\s+ko\s+(?:voice\s+)?call\s+(?:karo|lagao|karna|kar|laga|mar)/i, video: false },
    { re: /^(.+?)\s+(?:ko|se|par)\s+video\s+call/i, video: true },
    { re: /^video\s+call\s+(.+?)(?:\s+now)?$/i, video: true },
    { re: /^call\s+(.+?)(?:\s+now)?$/i, video: false },
    { re: /^(.+?)\s+ko\s+phone\s+(?:karo|lagao|laga)/i, video: false },
    { re: /^(.+?)\s+se\s+(?:baat|call)\s+karo/i, video: false },
    { re: /^(.+?)\s+ko\s+dial\s+karo/i, video: false },
  ];
  for (const { re, video } of callPatterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const contactName = extractContactName(m[1]);
      if (contactName.length >= 2) {
        return { type: "call_contact", contactName, callType: video ? "video" : "audio" };
      }
    }
  }

  const openPatterns = [
    /^(.+?)\s+(?:ka|ke)\s+chat\s+(?:kholo|open| dikhao)/i,
    /^(?:open|kholo)\s+(.+?)(?:\s+chat)?$/i,
    /^(.+?)\s+se\s+chat\s+kholo/i,
  ];
  for (const re of openPatterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const contactName = extractContactName(m[1]);
      if (contactName.length >= 2) return { type: "open_chat", contactName };
    }
  }

  const fromPatterns = [
    /^(.+?)\s+(?:ke|ka)\s+(?:message|messages|msg|sms)\s+(?:sunao|batao|padho|read|suno|dikhao)/i,
    /^(.+?)\s+se\s+(?:kya|kaun\s+sa|kaisa)\s+message\s+aaya/i,
    /^(.+?)\s+ne\s+(?:kya|kaisa)\s+(?:message|msg|bheja|likha)/i,
    /^(?:read|sunao)\s+(.+?)(?:'s)?\s+messages?/i,
    /^(.+?)\s+ka\s+(?:last|latest)\s+message/i,
  ];
  for (const re of fromPatterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const contactName = extractContactName(m[1]);
      if (contactName.length >= 2) {
        if (/last|latest|ne\s+kya|kya\s+message\s+aaya/i.test(raw)) {
          return { type: "last_message_from", contactName };
        }
        return { type: "messages_from", contactName };
      }
    }
  }

  if (/sab(?:hi)?\s+(?:ko|ke)?\s*(?:read|padh|seen)\s+(?:kar|mark|karo)/.test(n) || /mark\s+all\s+read/.test(n)) {
    return { type: "mark_all_read" };
  }
  const markRead = raw.match(/^(.+?)\s+(?:ke|ka)\s+(?:message|chat|msg)\s+(?:read|padh|seen)\s+(?:kar|mark)/i)
    ?? raw.match(/^(.+?)\s+ko\s+read\s+(?:kar|mark)/i);
  if (markRead?.[1]) {
    return { type: "mark_read", contactName: extractContactName(markRead[1]) };
  }

  if (/search\s+(.+)/i.test(raw)) {
    const q = raw.match(/search\s+(.+)/i)?.[1]?.trim();
    if (q && q.length >= 2) return { type: "search_messages", searchQuery: q };
  }
  if (/(?:message|chat)\s+mein\s+(.+?)\s+(?:dhundo|search|khojo)/i.test(raw)) {
    const q = raw.match(/(?:message|chat)\s+mein\s+(.+?)\s+(?:dhundo|search|khojo)/i)?.[1]?.trim();
    if (q) return { type: "search_messages", searchQuery: q };
  }

  if (
    /missed\s+call|call\s+miss|miss\s+ho(?:i|gaye)|kaun\s+sa\s+call\s+miss|kis(?:ne|ka)\s+call\s+miss/i.test(n)
    || /(?:video|voice)\s+call\s+miss/i.test(n)
  ) {
    return { type: "missed_calls" };
  }

  if (/recent\s+calls?|call\s+history|sab(?:hi)?\s+call/i.test(n) && !/miss/.test(n)) {
    return { type: "recent_calls" };
  }

  if (
    /group.*(?:mein|me)\s+kitne\s+message/.test(n)
    || /kis\s+group\s+mein\s+/.test(n)
    || /sab(?:hi)?\s+group.*message/.test(n)
    || /group\s+message\s+count/i.test(n)
  ) {
    return { type: "group_message_stats" };
  }

  if (/broadcast\s+list|mer[ei]\s+broadcast/i.test(n) && !/bhej|send/.test(n)) {
    return { type: "list_broadcasts" };
  }
  const bcSend = raw.match(/(?:broadcast|list)\s+(.+?)\s+(?:ko|mein|par)\s+(?:message|msg)?\s*(?:bhej|send)(?:o| do)?\s*(?:ki|ke|ye|yeh|that)?\s*(.+)$/i)
    ?? raw.match(/(.+?)\s+broadcast\s+(?:ko|mein)\s+(?:message|msg)?\s*(?:bhej|send)(?:o| do)?\s*(?:ki|ke|ye|yeh|that)?\s*(.+)$/i);
  if (bcSend?.[1] && bcSend[2]) {
    return {
      type: "send_broadcast",
      broadcastListName: extractContactName(bcSend[1]),
      messageText: bcSend[2].trim(),
    };
  }

  const khataSum = raw.match(/^(.+?)\s+(?:ka|ke)\s+khata\s+(?:batao|sunao|summary|dikhao)/i);
  if (khataSum?.[1]) {
    return { type: "khata_summary", contactName: extractContactName(khataSum[1]) };
  }
  const khataAdd = raw.match(/^(.+?)\s+(?:ka|ke|se)\s+(?:khata|udhar|hisab)\s+(?:mein\s+)?(\d+(?:\.\d+)?)\s*(?:rupee|rupaye|rs|₹)?\s*(?:ka|ke|ki)?\s*(.*)$/i)
    ?? raw.match(/^(.+?)\s+ko\s+(\d+(?:\.\d+)?)\s*(?:rupee|rupaye|rs|₹)?\s+(?:ka|ke)\s+khata\s+(?:likh|add|daal)(?:o| do)?\s*(.*)$/i);
  if (khataAdd?.[1] && khataAdd[2]) {
    return {
      type: "khata_add",
      contactName: extractContactName(khataAdd[1]),
      amount: Number(khataAdd[2]),
      note: khataAdd[3]?.trim() || undefined,
    };
  }

  if (
    /aaj\s+(?:kis|kaun|kin|kahan|kaha|kiske|konsa|kon)\s/.test(n) && /message/.test(n)
    || /aaj\s+(?:kaha|kahan)(?:\s+(?:kaha|kahan|se))?\s*(?:se\s+)?message/.test(n)
    || /aaj\s+.*message\s+(?:aaya|aaye)/.test(n)
    || /aaj\s+(?:ke|ka)\s+message/.test(n)
    || /kaun\s+kaun\s+ne\s+message/.test(n)
    || /mujhe\s+aaj\s+.*message/.test(n)
    || /today.*message/.test(n)
    || /who\s+messaged\s+(?:me\s+)?today/.test(n)
  ) {
    return { type: "messages_today" };
  }

  if (
    /kitne\s+(?:unread|padhe|bache|baaki|pending)\s+message/.test(n)
    || /unread\s+message\s+kitne/.test(n)
    || /message\s+kitne\s+(?:bache|pending)/.test(n)
  ) {
    return { type: "unread_count" };
  }

  if (/important\s+message/.test(n) || /zaruri\s+message/.test(n)) {
    return { type: "important_messages" };
  }

  if (/summary/.test(n) || /overview/.test(n)) {
    return { type: "chat_summary" };
  }

  if (/(?:mera|mere)\s+(?:contact|dost|chat)/.test(n) || /kaun\s+kaun\s+(?:chat|contact|dost)/.test(n) || /contacts?\s+list/.test(n)) {
    return { type: "list_contacts" };
  }

  return { type: "unknown", raw };
}

export type PlannedAction = {
  intent: AssistantIntent["type"] | "reply" | "project_qa";
  contactName?: string;
  messageText?: string;
  broadcastListName?: string;
  callType?: "audio" | "video";
  searchQuery?: string;
  amount?: number;
  note?: string;
  speak?: string;
};

export function intentToPlanned(intent: AssistantIntent): PlannedAction {
  switch (intent.type) {
    case "send_message":
      return { intent: intent.type, contactName: intent.contactName, messageText: intent.messageText };
    case "messages_from":
    case "last_message_from":
    case "call_contact":
    case "open_chat":
    case "mark_read":
    case "khata_summary":
    case "khata_add":
      return {
        intent: intent.type,
        contactName: intent.contactName,
        callType: intent.type === "call_contact" ? intent.callType : undefined,
        amount: intent.type === "khata_add" ? intent.amount : undefined,
        note: intent.type === "khata_add" ? intent.note : undefined,
      };
    case "send_broadcast":
      return {
        intent: intent.type,
        broadcastListName: intent.broadcastListName,
        messageText: intent.messageText,
      };
    case "search_messages":
      return { intent: intent.type, searchQuery: intent.searchQuery };
    default:
      return { intent: intent.type };
  }
}
