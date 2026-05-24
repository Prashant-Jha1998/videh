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
  | { type: "unknown"; raw: string };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[।.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripWakePrefix(raw: string): string {
  return raw
    .replace(/^(hey\s+videh|he\s+videh|videh|हे\s+विदेह|हे\s+वीडेह)[,\s]*/i, "")
    .trim();
}

function extractContactName(fragment: string): string {
  return fragment
    .trim()
    .replace(/\s+ko\s*$/i, "")
    .replace(/\s+se\s*$/i, "")
    .replace(/\s+ka\s*$/i, "")
    .replace(/\s+ke\s*$/i, "")
    .replace(/\s+ki\s*$/i, "")
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
    { re: /^(.+?)\s+ko\s+(?:message|msg|sms)\s+bhej(?:o|na| do| dena)?\s+(?:ki|ke|ye|yeh|that)?\s*(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(.+?)\s+ko\s+b(?:hej|olo|ata)(?:o|na| do| dena)?\s+(?:ki|ke|ye|yeh|that)?\s*(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(?:message|msg|sms)\s+bhej(?:o|na| do)?\s+(.+?)\s+ko\s+(?:ki|ke|ye|yeh|that)?\s*(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(?:message|msg)\s+(.+?)\s+ko\s+(?:bhej|send)(?:o|na| do)?\s+(?:ki|ke|ye|yeh|that)?\s*(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(.+?)\s+ko\s+(?:likh|type)\s+(?:kar\s+)?(?:do|de|dena)\s+(?:ki|ke|ye|yeh|that)?\s*(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^send\s+(?:a\s+)?message\s+to\s+(.+?)\s+(?:saying|that|ki)\s+(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^message\s+(.+?)\s+(?:and\s+)?(?:say|saying|ki|ke)\s+(.+)$/i, contactIdx: 1, msgIdx: 2 },
    { re: /^(.+?)\s+ko\s+(.+)\s+bhej\s+do$/i, contactIdx: 1, msgIdx: 2 },
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

  const fromPatterns = [
    /^(.+?)\s+(?:ke|ka)\s+(?:message|messages|msg|sms)\s+(?:sunao|batao|padho|read|suno)/i,
    /^(.+?)\s+se\s+(?:kya|kaun\s+sa|kaisa)\s+message\s+aaya/i,
    /^(.+?)\s+ne\s+(?:kya|kaisa)\s+(?:message|msg|bheja|likha)/i,
    /^(?:read|sunao)\s+(.+?)(?:'s)?\s+messages?/i,
    /^(.+?)\s+ka\s+last\s+message/i,
    /^(.+?)\s+ka\s+latest\s+message/i,
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

  if (
    /aaj\s+(?:kis|kaun|kin|kahan|kaha|kiske|konsa|kon)\s/.test(n)
    && /message/.test(n)
  ) {
    return { type: "messages_today" };
  }
  if (
    /aaj\s+(?:kaha|kahan)(?:\s+(?:kaha|kahan|se))?\s*(?:se\s+)?message/.test(n)
    || /aaj\s+.*message\s+(?:aaya|aaye|aaye\s+hain)/.test(n)
  ) {
    return { type: "messages_today" };
  }
  if (
    /aaj\s+(?:ke|ka)\s+message/.test(n)
    || /today.*message/.test(n)
    || /message.*aaj/.test(n)
    || /aaj\s+kaun\s+message/.test(n)
  ) {
    return { type: "messages_today" };
  }

  if (
    /kitne\s+(?:unread|padhe|bache|baaki)\s+message/.test(n)
    || /unread\s+message\s+kitne/.test(n)
    || /kitne\s+message\s+(?:nahi\s+)?padhe/.test(n)
  ) {
    return { type: "unread_count" };
  }

  if (
    /important\s+message/.test(n)
    || /zaruri\s+message/.test(n)
    || /important.*(?:sunao|batao|padho)/.test(n)
    || /missed\s+message/.test(n)
    || /padhe\s+nahi\s+.*message.*sunao/.test(n)
    || /unread\s+message.*sunao/.test(n)
  ) {
    return { type: "important_messages" };
  }

  if (
    /sabka\s+summary/.test(n)
    || /summary\s+bana/.test(n)
    || /chat\s+summary/.test(n)
    || /sab\s+(?:ka|ke)\s+summary/.test(n)
    || /overview/.test(n)
    || /aaj\s+ka\s+summary/.test(n)
    || /poora\s+summary/.test(n)
  ) {
    return { type: "chat_summary" };
  }

  if (
    /(?:mera|mere)\s+(?:contact|dost|chat)/.test(n)
    || /kaun\s+kaun\s+(?:chat|contact|dost)/.test(n)
    || /list\s+(?:my\s+)?contacts/.test(n)
    || /contacts?\s+list/.test(n)
  ) {
    return { type: "list_contacts" };
  }

  return { type: "unknown", raw };
}

export type PlannedAction = {
  intent: AssistantIntent["type"] | "reply";
  contactName?: string;
  messageText?: string;
  speak?: string;
};

export function intentToPlanned(intent: AssistantIntent): PlannedAction {
  switch (intent.type) {
    case "send_message":
      return { intent: intent.type, contactName: intent.contactName, messageText: intent.messageText };
    case "messages_from":
    case "last_message_from":
      return { intent: intent.type, contactName: intent.contactName };
    default:
      return { intent: intent.type };
  }
}
