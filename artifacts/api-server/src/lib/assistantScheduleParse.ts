/** Parse natural Hindi/English schedule phrases to a future Date in IST. */

function istNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function withTime(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const TIME_MARKERS =
  /\b(kal|aaj|tomorrow|today|parso|subah|shaam|sham|raat|night|morning|evening|baje|pm|am|din|ko)\b|\d{1,2}(?::\d{2})?/i;

export function textLooksLikeScheduleTime(text: string): boolean {
  return TIME_MARKERS.test(text);
}

export function parseScheduleDateTime(text: string): Date | null {
  const n = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!n || !TIME_MARKERS.test(n)) return null;

  const now = istNow();
  const day = new Date(now);

  if (/\b(parso|day\s+after\s+tomorrow)\b/.test(n)) {
    day.setDate(day.getDate() + 2);
  } else if (/\b(kal|tomorrow|agle\s+din)\b/.test(n)) {
    day.setDate(day.getDate() + 1);
  }

  const isPmHint = /\b(sham|shaam|evening|raat|night|pm)\b/.test(n);
  const isAmHint = /\b(subah|morning|am|dopahar)\b/.test(n);

  const digitMatch = n.match(/(\d{1,2})(?::(\d{2}))?\s*(?:baje|pm|am)?/);
  if (!digitMatch) return null;

  let hour = Number(digitMatch[1]);
  const minute = digitMatch[2] ? Number(digitMatch[2]) : 0;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;

  if (isPmHint && hour < 12) hour += 12;
  else if (isAmHint && hour === 12) hour = 0;
  else if (!isPmHint && !isAmHint) {
    if (hour >= 1 && hour <= 8) hour += 12;
  }

  let scheduled = withTime(day, hour, minute);
  if (scheduled <= now) {
    scheduled = withTime(new Date(day.getTime() + 86_400_000), hour, minute);
  }
  return scheduled;
}

export function stripScheduleTimePhrases(text: string): string {
  return text
    .replace(/\b(kal|aaj|tomorrow|today|parso|agle\s+din|subah|shaam|sham|raat|night|morning|evening|baje|pm|am)\b/gi, "")
    .replace(/\d{1,2}(?::\d{2})?\s*(?:baje|pm|am)?/gi, "")
    .replace(/\b(?:ko|par|pe|mein|me)\b/gi, "")
    .replace(/^(?:message|msg|text|ki|ke|ye|yeh|that)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
