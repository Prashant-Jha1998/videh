export type TemplateButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export type BusinessTemplateButton = {
  type: TemplateButtonType;
  text: string;
  url?: string;
  phone_number?: string;
};

export type BusinessTemplateHeader = {
  format: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
  text?: string;
  mediaUrl?: string;
  documentName?: string;
};

export type BusinessTemplatePayload = {
  kind: "business_template";
  templateKey?: string;
  header?: BusinessTemplateHeader;
  body: string;
  footer?: string;
  buttons: BusinessTemplateButton[];
};

export function parseBusinessTemplatePayload(raw: string): BusinessTemplatePayload | null {
  const text = (raw ?? "").trim();
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as BusinessTemplatePayload;
    if (parsed?.kind !== "business_template") return null;
    if (typeof parsed.body !== "string") return null;
    return {
      kind: "business_template",
      templateKey: parsed.templateKey,
      header: parsed.header,
      body: parsed.body,
      footer: parsed.footer,
      buttons: Array.isArray(parsed.buttons) ? parsed.buttons : [],
    };
  } catch {
    return null;
  }
}

export function businessTemplatePreviewText(payload: BusinessTemplatePayload): string {
  const parts: string[] = [];
  if (payload.header?.format === "TEXT" && payload.header.text) parts.push(payload.header.text);
  if (payload.body) parts.push(payload.body);
  if (payload.footer) parts.push(payload.footer);
  const joined = parts.join("\n").trim();
  if (joined) return joined.length > 120 ? `${joined.slice(0, 119)}…` : joined;
  return payload.buttons[0]?.text ?? "Business message";
}

const READ_MORE_THRESHOLD = 160;

export function shouldShowReadMore(body: string): boolean {
  return body.trim().length > READ_MORE_THRESHOLD;
}

export function truncateTemplateBody(body: string): string {
  const t = body.trim();
  if (t.length <= READ_MORE_THRESHOLD) return t;
  return `${t.slice(0, READ_MORE_THRESHOLD).trimEnd()}…`;
}

export function normalizePhoneDialUri(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `tel:${digits}`;
  if (digits.length === 10) return `tel:+91${digits}`;
  return `tel:${digits}`;
}

export function normalizeExternalUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}
