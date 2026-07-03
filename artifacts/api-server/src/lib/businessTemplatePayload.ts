import { normalizeHeaderFormat, parseButtonsJson, type TemplateButton } from "./templateComponents";
import type { MessageTemplateRow } from "./developerTemplates";
import type { SendMessageBody } from "./developerApiSend";

export function toPublicAssetUrl(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u) || u.startsWith("data:")) return u;
  const base = (
    process.env["API_PUBLIC_URL"]?.trim() ||
    process.env["VIDEH_PUBLIC_URL"]?.trim() ||
    "https://videh.co.in"
  ).replace(/\/$/, "");
  return u.startsWith("/") ? `${base}${u}` : `${base}/${u}`;
}

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
  buttons: TemplateButton[];
};

function textParamsFromComponents(components: unknown, type: "header" | "body"): string[] {
  if (!Array.isArray(components)) return [];
  const out: string[] = [];
  for (const raw of components) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (String(c.type ?? "").toLowerCase() !== type) continue;
    if (!Array.isArray(c.parameters)) continue;
    for (const p of c.parameters) {
      if (!p || typeof p !== "object") continue;
      const param = p as Record<string, unknown>;
      if (String(param.type ?? "").toLowerCase() === "text") {
        out.push(String(param.text ?? ""));
      }
    }
  }
  return out;
}

function applyVariables(text: string, values: string[]): string {
  let out = text;
  values.forEach((val, i) => {
    out = out.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, "g"), val);
  });
  return out;
}

function applyVariablesToButtons(buttons: TemplateButton[], values: string[]): TemplateButton[] {
  return buttons.map((btn) => {
    if (btn.type === "URL" && btn.url) {
      return { ...btn, url: applyVariables(btn.url, values) };
    }
    return btn;
  });
}

/** Structured standard template payload for Videh inbox delivery. */
export function buildBusinessTemplatePayload(
  tmpl: MessageTemplateRow,
  apiBody: SendMessageBody,
): BusinessTemplatePayload {
  const components = apiBody.template?.components;
  const headerParams = textParamsFromComponents(components, "header");
  const bodyParams = textParamsFromComponents(components, "body");
  const headerType = normalizeHeaderFormat(tmpl.header_type);
  const body = applyVariables(String(tmpl.body_text ?? ""), bodyParams).trim();
  const footer = String(tmpl.footer_text ?? "").trim();
  const buttons = applyVariablesToButtons(parseButtonsJson(tmpl.buttons_json), bodyParams);

  let header: BusinessTemplateHeader | undefined;
  if (headerType === "TEXT" && tmpl.header_text) {
    header = {
      format: "TEXT",
      text: applyVariables(tmpl.header_text, headerParams).trim(),
    };
  } else if (headerType === "IMAGE") {
    const mediaUrl = toPublicAssetUrl(tmpl.header_media_url);
    if (mediaUrl) header = { format: "IMAGE", mediaUrl };
  } else if (headerType === "VIDEO") {
    const mediaUrl = toPublicAssetUrl(tmpl.header_media_url);
    if (mediaUrl) header = { format: "VIDEO", mediaUrl };
  } else if (headerType === "DOCUMENT") {
    const mediaUrl = toPublicAssetUrl(tmpl.header_media_url);
    if (mediaUrl) {
      const name = mediaUrl.split("/").pop()?.split("?")[0] || "Document";
      header = { format: "DOCUMENT", mediaUrl, documentName: name };
    }
  }

  return {
    kind: "business_template",
    templateKey: tmpl.template_key ?? undefined,
    header,
    body,
    footer: footer || undefined,
    buttons,
  };
}

export function serializeBusinessTemplatePayload(payload: BusinessTemplatePayload): string {
  return JSON.stringify(payload);
}

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

/** Flat text fallback for push notifications and legacy clients. */
export function businessTemplatePlainPreview(payload: BusinessTemplatePayload): string {
  const parts: string[] = [];
  if (payload.header?.format === "TEXT" && payload.header.text) {
    parts.push(payload.header.text);
  }
  if (payload.body) parts.push(payload.body);
  if (payload.footer) parts.push(payload.footer);
  const joined = parts.join("\n").trim();
  if (joined) return joined.length > 120 ? `${joined.slice(0, 119)}…` : joined;
  if (payload.buttons[0]?.text) return payload.buttons[0].text;
  return "Business message";
}

/** Primary media URL for messages.media_url (image/video/document header). */
export function businessTemplateMediaUrl(payload: BusinessTemplatePayload): string | null {
  const url = payload.header?.mediaUrl?.trim();
  return url || null;
}

export function isDeliverableTemplate(payload: BusinessTemplatePayload): boolean {
  return Boolean(
    payload.body.trim()
    || payload.header?.mediaUrl
    || payload.header?.text
    || payload.buttons.length > 0,
  );
}
