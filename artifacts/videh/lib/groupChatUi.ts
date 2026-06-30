/** Group @mention + sender UI helpers (WhatsApp-style). */

export const MENTION_ALL_TOKEN = "all";

export type GroupMentionMember = {
  id: number;
  name: string;
  phone?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
};

const MENTION_BODY = `[A-Za-z0-9\u0900-\u0D7F][A-Za-z0-9\u0900-\u0D7F._-]*`;
const SINGLE_MENTION_RE = new RegExp(`^@(?:${MENTION_ALL_TOKEN}|${MENTION_BODY})`, "u");

export function memberDisplayLabel(member: GroupMentionMember): string {
  return member.name?.trim() || member.phone?.trim() || `Member ${member.id}`;
}

export function memberInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function groupMemberMentionNames(members: GroupMentionMember[]): string[] {
  const names = members.map((m) => memberDisplayLabel(m).trim()).filter(Boolean);
  return [...new Set(names)].sort((a, b) => b.length - a.length);
}

export function filterGroupMentionMembers(
  members: GroupMentionMember[],
  query: string,
  viewerId?: number,
): GroupMentionMember[] {
  const q = query.trim().toLowerCase();
  return members.filter((m) => {
    if (viewerId != null && m.id === viewerId) return false;
    if (!q) return true;
    const name = m.name.toLowerCase();
    const phone = (m.phone ?? "").replace(/\D/g, "");
    const qDigits = q.replace(/\D/g, "");
    return name.includes(q) || (qDigits.length >= 3 && phone.includes(qDigits));
  });
}

export function showMentionAllOption(query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || MENTION_ALL_TOKEN.startsWith(q);
}

const SENDER_NAME_COLORS = [
  "#E5425A",
  "#E9710F",
  "#1FA855",
  "#027EB5",
  "#7E57C2",
  "#00897B",
  "#5C6BC0",
  "#C2185B",
  "#6D4C41",
  "#F4511E",
] as const;

export function groupSenderAccentColor(senderId: string): string {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) {
    hash = (hash * 31 + senderId.charCodeAt(i)) | 0;
  }
  return SENDER_NAME_COLORS[Math.abs(hash) % SENDER_NAME_COLORS.length]!;
}

/** Split message text into plain + @mention segments for styled rendering. */
export function splitChatMentionSegments(
  text: string,
  knownMentionNames: string[] = [],
): { mention: boolean; value: string }[] {
  if (!text.includes("@")) {
    return [{ mention: false, value: text }];
  }

  const names = [...knownMentionNames]
    .map((n) => n.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const segments: { mention: boolean; value: string }[] = [];
  let i = 0;

  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at === -1) {
      segments.push({ mention: false, value: text.slice(i) });
      break;
    }
    if (at > i) {
      segments.push({ mention: false, value: text.slice(i, at) });
    }

    const rest = text.slice(at);
    let matched = false;

    if (rest.toLowerCase().startsWith(`@${MENTION_ALL_TOKEN}`)) {
      const token = `@${MENTION_ALL_TOKEN}`;
      const next = rest[token.length];
      if (next === undefined || /\s/.test(next)) {
        segments.push({ mention: true, value: token });
        i = at + token.length;
        matched = true;
      }
    }

    if (!matched) {
      for (const name of names) {
        const token = `@${name}`;
        if (!rest.startsWith(token)) continue;
        const next = rest[token.length];
        if (next !== undefined && !/\s/.test(next)) continue;
        segments.push({ mention: true, value: token });
        i = at + token.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      const single = rest.match(SINGLE_MENTION_RE);
      if (single?.[0]) {
        segments.push({ mention: true, value: single[0] });
        i = at + single[0].length;
        matched = true;
      }
    }

    if (!matched) {
      segments.push({ mention: false, value: "@" });
      i = at + 1;
    }
  }

  if (segments.length === 0) {
    segments.push({ mention: false, value: text });
  }
  return segments;
}

/** First message in a run from the same sender shows name + avatar (group chats). */
export function buildGroupSenderHeaderMap(
  messages: { id: string; senderId: string; type: string }[],
  isGroup: boolean,
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  if (!isGroup) return map;
  let prevSender: string | undefined;
  for (const m of messages) {
    if (m.type === "system") continue;
    if (m.senderId === "me") {
      prevSender = "me";
      continue;
    }
    map.set(m.id, m.senderId !== prevSender);
    prevSender = m.senderId;
  }
  return map;
}
