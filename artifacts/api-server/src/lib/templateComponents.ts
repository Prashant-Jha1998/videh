export type HeaderFormat = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

export type TemplateButton = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
};

const HEADER_FORMATS = new Set<HeaderFormat>(["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"]);
const MAX_BUTTONS = 3;

export function normalizeHeaderFormat(raw: string | null | undefined): HeaderFormat {
  const u = String(raw ?? "NONE").toUpperCase();
  if (u === "TEXT" || u === "IMAGE" || u === "VIDEO" || u === "DOCUMENT") return u;
  return "NONE";
}

export function parseButtonsJson(raw: unknown): TemplateButton[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateButton[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = String(o.type ?? "").toUpperCase();
    const text = String(o.text ?? "").trim().slice(0, 25);
    if (!text) continue;
    if (type === "QUICK_REPLY") {
      out.push({ type: "QUICK_REPLY", text });
    } else if (type === "URL") {
      const url = String(o.url ?? "").trim().slice(0, 2000);
      if (url) out.push({ type: "URL", text, url });
    } else if (type === "PHONE_NUMBER") {
      const phone_number = String(o.phone_number ?? o.phone ?? "").trim().slice(0, 20);
      if (phone_number) out.push({ type: "PHONE_NUMBER", text, phone_number });
    }
    if (out.length >= MAX_BUTTONS) break;
  }
  return out;
}

export function parseVariableSamples(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k).replace(/\D/g, "") || String(k);
    if (!key) continue;
    out[key] = String(v ?? "").slice(0, 120);
  }
  return out;
}

export function extractBodyVariableIndexes(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) {
    found.add(m[1]!);
  }
  return [...found].sort((a, b) => Number(a) - Number(b));
}

export function validateTemplateComponents(input: {
  headerFormat?: string;
  headerText?: string;
  headerMediaUrl?: string;
  bodyText: string;
  footerText?: string;
  buttons?: unknown;
}): { ok: true } | { ok: false; message: string } {
  const headerFormat = normalizeHeaderFormat(input.headerFormat);
  const headerText = String(input.headerText ?? "").trim();
  const headerMediaUrl = String(input.headerMediaUrl ?? "").trim();
  const bodyText = input.bodyText.trim();
  const footerText = String(input.footerText ?? "").trim();
  const buttons = parseButtonsJson(input.buttons);

  if (!bodyText) return { ok: false, message: "Message body is required." };
  if (bodyText.length > 1024) return { ok: false, message: "Body text is too long (max 1024 characters)." };
  if (footerText.length > 60) return { ok: false, message: "Footer max 60 characters." };

  if (headerFormat === "TEXT") {
    if (!headerText) return { ok: false, message: "Header text is required for TEXT header." };
    if (headerText.length > 60) return { ok: false, message: "Header text max 60 characters." };
  }
  if (headerFormat === "IMAGE" || headerFormat === "VIDEO" || headerFormat === "DOCUMENT") {
    if (!headerMediaUrl && headerFormat === "IMAGE") {
      /* allow empty URL at submit — preview uses placeholder */
    }
    if (headerMediaUrl.length > 2000) return { ok: false, message: "Header media URL is too long." };
  }

  const urlButtons = buttons.filter((b) => b.type === "URL").length;
  const phoneButtons = buttons.filter((b) => b.type === "PHONE_NUMBER").length;
  const quickButtons = buttons.filter((b) => b.type === "QUICK_REPLY").length;
  if (buttons.length > MAX_BUTTONS) return { ok: false, message: "Maximum 3 buttons allowed." };
  if (urlButtons > 2) return { ok: false, message: "Maximum 2 URL buttons." };
  if (phoneButtons > 1) return { ok: false, message: "Maximum 1 phone button." };
  if (quickButtons > 3) return { ok: false, message: "Maximum 3 quick reply buttons." };
  if (urlButtons + phoneButtons + quickButtons > MAX_BUTTONS) {
    return { ok: false, message: "Too many buttons." };
  }

  return { ok: true };
}
