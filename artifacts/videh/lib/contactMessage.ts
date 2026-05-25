export const CONTACT_MSG_PREFIX = "__VCONTACT__:";

export type SharedContactPayload = {
  name: string;
  phones: string[];
  emails?: string[];
};

/** Normalize for duplicate detection (same SIM entry often appears 2–3× on Android). */
export function normalizePhoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function dedupePhones(phones: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of phones) {
    const p = raw.trim();
    if (!p) continue;
    const key = normalizePhoneKey(p) || p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw.trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(raw.trim());
  }
  return out;
}

export function contactDisplayName(c: {
  name?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  const direct = (c.name ?? "").trim();
  if (direct) return direct;
  return [c.firstName, c.middleName, c.lastName].filter(Boolean).join(" ").trim();
}

export function encodeContactMessage(payload: SharedContactPayload): string {
  return CONTACT_MSG_PREFIX + JSON.stringify({
    v: 1,
    name: payload.name.trim() || "Contact",
    phones: dedupePhones(payload.phones),
    emails: dedupeEmails(payload.emails ?? []),
  });
}

export function parseContactMessage(text: string): SharedContactPayload | null {
  if (!text) return null;
  if (text.startsWith(CONTACT_MSG_PREFIX)) {
    try {
      const raw = JSON.parse(text.slice(CONTACT_MSG_PREFIX.length)) as {
        name?: string;
        phones?: string[];
        emails?: string[];
      };
      return {
        name: (raw.name ?? "Contact").trim() || "Contact",
        phones: dedupePhones(Array.isArray(raw.phones) ? raw.phones.filter(Boolean) : []),
        emails: dedupeEmails(Array.isArray(raw.emails) ? raw.emails.filter(Boolean) : []),
      };
    } catch {
      return null;
    }
  }
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const name = lines[0]!.replace(/^👤\s*/, "").trim() || "Contact";
  const phones = dedupePhones(lines.slice(1).filter((l) => /[\d+]/.test(l)));
  return { name, phones, emails: [] };
}

export function contactChatPreview(text: string): string {
  const p = parseContactMessage(text);
  return p ? `👤 ${p.name}` : "Contact";
}
