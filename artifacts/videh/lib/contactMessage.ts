export const CONTACT_MSG_PREFIX = "__VCONTACT__:";

export type SharedContactPayload = {
  name: string;
  phones: string[];
  emails?: string[];
};

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
    phones: payload.phones.filter(Boolean),
    emails: payload.emails?.filter(Boolean) ?? [],
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
        phones: Array.isArray(raw.phones) ? raw.phones.filter(Boolean) : [],
        emails: Array.isArray(raw.emails) ? raw.emails.filter(Boolean) : [],
      };
    } catch {
      return null;
    }
  }
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const name = lines[0]!.replace(/^👤\s*/, "").trim() || "Contact";
  const phones = lines.slice(1).filter((l) => /[\d+]/.test(l));
  return { name, phones, emails: [] };
}

export function contactChatPreview(text: string): string {
  const p = parseContactMessage(text);
  return p ? `👤 ${p.name}` : "Contact";
}
