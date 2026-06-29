/**
 * Wake phrase: "Hey Friend" activates Videh assistant.
 * Assistant name/branding stays Videh — only the wake phrase changed.
 */

export const ASSISTANT_BRAND_NAME = "Videh";
export const WAKE_PHRASE_LABEL = "Hey Friend";

const WAKE_PHRASES = [
  "hey friend",
  "he friend",
  "hay friend",
  "hi friend",
  "hello friend",
  "helo friend",
  "hey frnd",
  "hey frend",
  "hey friends",
  "ok friend",
  "oye friend",
  "hey fren",
  "hey frined",
  "hey freind",
  "हे फ्रेंड",
  "हाय फ्रेंड",
  "हे फ्रेंड्स",
  "हे दोस्त",
  "हाय दोस्त",
].sort((a, b) => b.length - a.length);

const WAKE_REGEX = new RegExp(
  `^(?:${WAKE_PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})[,.\\s]*`,
  "i",
);

const FRIEND_WORD_RE = /\b(friend|friends|frnd|frend|fren|frined|freind|फ्रेंड|फ्रेंड्स|दोस्त)\b/i;

/** Full wake phrase only — not lone "hey" or "hello". */
const STANDALONE_WAKE_RE =
  /^(?:hey|he|hay|hi|hello|helo|oye|ok|okay)\s+(?:friend|friends|frnd|frend|fren|frined|freind|फ्रेंड|दोस्त)[,.!?\s]*$/i;

export function containsWakePhrase(text: string): boolean {
  const n = text.toLowerCase().trim();
  if (!n) return false;
  if (STANDALONE_WAKE_RE.test(n)) return true;
  if (WAKE_PHRASES.some((p) => n.includes(p))) return true;
  if (/\b(hey|he|hay|hi|hello|oye)\b/.test(n) && FRIEND_WORD_RE.test(n)) {
    return true;
  }
  return false;
}

export function extractCommandAfterWake(text: string): string {
  const raw = text.trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  for (const phrase of WAKE_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx >= 0) {
      return raw.slice(idx + phrase.length).replace(/^[,.\\s]+/, "").trim();
    }
  }
  if (/\b(hey|he|hay|hi|hello|oye)\b/i.test(raw) && FRIEND_WORD_RE.test(raw)) {
    return raw
      .replace(/^(?:hey|he|hay|hi|hello|helo|oye)\s+(?:friend|friends|frnd|frend|fren)\s*/i, "")
      .trim();
  }
  return raw;
}

export function stripWakeFromCommand(text: string): string {
  let t = text.trim();
  if (!t) return "";
  for (let i = 0; i < 3; i++) {
    const next = t.replace(WAKE_REGEX, "").trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

export function parseWakeUtterance(text: string): { hasWake: boolean; command: string } {
  const raw = text.trim();
  if (!containsWakePhrase(raw)) {
    return { hasWake: false, command: raw };
  }
  const after = extractCommandAfterWake(raw);
  const command = stripWakeFromCommand(after);
  return { hasWake: true, command };
}

export const WAKE_CONTEXT_STRINGS = [
  "hey friend",
  "hi friend",
  "hello friend",
  "hey frnd",
  "हे फ्रेंड",
  "हे दोस्त",
  ...WAKE_PHRASES,
];
