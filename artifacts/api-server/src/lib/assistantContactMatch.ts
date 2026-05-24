export type ChatRef = {
  chatId: number;
  displayName: string;
  otherUserId: number;
  isGroup: boolean;
};

export type BroadcastRef = {
  id: number;
  name: string;
};

export type ContactMatchContext = {
  chats: ChatRef[];
  broadcastLists: BroadcastRef[];
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Score 0–100 how well needle matches a contact/group name. */
export function scoreNameMatch(needle: string, candidate: string): number {
  const n = norm(needle);
  const c = norm(candidate);
  if (!n || !c) return 0;
  if (c === n) return 100;
  if (c.startsWith(n) || n.startsWith(c)) return 92;
  if (c.includes(n) || n.includes(c)) return 85;

  const nParts = n.split(" ").filter(Boolean);
  const cParts = c.split(" ").filter(Boolean);
  const nFirst = nParts[0] ?? "";
  const cFirst = cParts[0] ?? "";
  if (nFirst && cFirst && (cFirst.startsWith(nFirst) || nFirst.startsWith(cFirst))) return 78;

  let hits = 0;
  for (const p of nParts) {
    if (p.length < 2) continue;
    if (cParts.some((cp) => cp.includes(p) || p.includes(cp))) hits++;
  }
  if (hits > 0) return 55 + hits * 12;

  return 0;
}

export function matchChatByName(
  ctx: ContactMatchContext,
  contactName: string,
): ChatRef | null {
  const needle = contactName.trim();
  if (!needle) return null;

  let best: ChatRef | null = null;
  let bestScore = 0;
  for (const chat of ctx.chats) {
    const score = scoreNameMatch(needle, chat.displayName);
    if (score > bestScore) {
      bestScore = score;
      best = chat;
    }
  }
  return bestScore >= 45 ? best : null;
}

export function matchBroadcastByName(
  ctx: ContactMatchContext,
  listName: string,
): BroadcastRef | null {
  const needle = listName.trim();
  if (!needle) return null;

  let best: BroadcastRef | null = null;
  let bestScore = 0;
  for (const list of ctx.broadcastLists) {
    const score = scoreNameMatch(needle, list.name);
    if (score > bestScore) {
      bestScore = score;
      best = list;
    }
  }
  return bestScore >= 45 ? best : null;
}

/** Suggest close matches when exact match fails. */
export function suggestChatNames(ctx: ContactMatchContext, needle: string, limit = 3): string[] {
  return ctx.chats
    .map((c) => ({ name: c.displayName, score: scoreNameMatch(needle, c.displayName) }))
    .filter((x) => x.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.name);
}
