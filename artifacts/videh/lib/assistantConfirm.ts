/** Voice yes/no for call confirm and session exit. */

const YES_RE =
  /^(haan|ha|han|yes|yeah|yep|ok|okay|theek|thik|sahi|ji|haan\s+ji|kar\s+do|kar\s+do|lagao|laga\s+do|confirm|sure|please|bilkul|zaroor)/i;

const NO_RE =
  /^(nahi|na|no|nope|cancel|mat|band|ruk|stop|decline|cancel\s+kar|mat\s+kar)/i;

const EXIT_RE =
  /^(bas|band\s+karo|thank\s+you|thanks|bye|goodbye|khatam|exit|close|alvida|dhanyavad|shukriya)/i;

export function isAffirmative(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return YES_RE.test(t) || /\b(haan|yes)\b/.test(t);
}

export function isNegative(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return NO_RE.test(t);
}

export function isSessionExit(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return EXIT_RE.test(t);
}
