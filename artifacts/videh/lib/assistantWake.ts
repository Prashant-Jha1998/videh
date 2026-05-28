/** Wake phrase detection and command extraction (Hey Videh). */

const WAKE_PHRASES = [
  "hey videh",
  "he videh",
  "hay videh",
  "hi videh",
  "hello videh",
  "helo videh",
  "hey vede",
  "hey vadeh",
  "hey video",
  "hey wede",
  "hey vidhe",
  "hey vidh",
  "he video",
  "hay video",
  "hi video",
  "play videh",
  "ok videh",
  "oye videh",
  "हे विदेह",
  "है विदेह",
  "हे वीडेह",
  "हाय विदेह",
  "विदेह जी",
  "वीडेह",
].sort((a, b) => b.length - a.length);

const WAKE_REGEX = new RegExp(
  `^(?:${WAKE_PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})[,.\\s]*`,
  "i",
);

export function containsWakePhrase(text: string): boolean {
  const n = text.toLowerCase().trim();
  if (!n) return false;
  if (WAKE_PHRASES.some((p) => n.includes(p))) return true;
  // STT often splits "Hey Videh" — accept both words nearby
  if (/\b(hey|he|hay|hi|hello|oye)\b/.test(n) && /\b(videh|vidhe|video|vede|vadeh|wede)\b/.test(n)) {
    return true;
  }
  return false;
}

/** Text after the wake phrase in the same utterance (may be empty). */
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
  return raw;
}

/** Remove wake phrase if user repeats it before the command. */
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

export const WAKE_CONTEXT_STRINGS = WAKE_PHRASES;
