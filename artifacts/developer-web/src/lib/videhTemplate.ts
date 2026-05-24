export type HeaderFormat = "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";

export type TemplateButton = {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
};

export type TemplateDraft = {
  templateKey: string;
  name: string;
  category: string;
  language: string;
  headerFormat: HeaderFormat;
  headerText: string;
  headerMediaUrl: string;
  bodyText: string;
  footerText: string;
  buttons: TemplateButton[];
  variableSamples: Record<string, string>;
};

export const EMPTY_TEMPLATE_DRAFT: TemplateDraft = {
  templateKey: "",
  name: "",
  category: "utility",
  language: "en",
  headerFormat: "NONE",
  headerText: "",
  headerMediaUrl: "",
  bodyText: "",
  footerText: "",
  buttons: [],
  variableSamples: {},
};

export function extractVariableIndexes(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) found.add(m[1]!);
  return [...found].sort((a, b) => Number(a) - Number(b));
}

export function renderBodyWithSamples(body: string, samples: Record<string, string>): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const sample = samples[n]?.trim();
    return sample || `{{${n}}}`;
  });
}

export function formatBodyForPreview(body: string): string[] {
  return body.split(/\n/).filter((line, i, arr) => line.length > 0 || i < arr.length - 1);
}

export function draftFromPortalTemplate(t: {
  name: string;
  display_name?: string;
  category?: string;
  language?: string;
  header_format?: string;
  header_type?: string | null;
  header_text?: string;
  header_media_url?: string;
  body_text?: string;
  body_preview?: string;
  footer_text?: string;
  buttons?: TemplateButton[];
  variable_samples?: Record<string, string>;
}): TemplateDraft {
  const fmt = String(t.header_format ?? t.header_type ?? "NONE").toUpperCase();
  const headerFormat =
    fmt === "TEXT" || fmt === "IMAGE" || fmt === "VIDEO" || fmt === "DOCUMENT"
      ? (fmt as HeaderFormat)
      : "NONE";
  return {
    templateKey: t.name,
    name: t.display_name ?? t.name,
    category: t.category ?? "utility",
    language: t.language ?? "en",
    headerFormat,
    headerText: t.header_text ?? "",
    headerMediaUrl: t.header_media_url ?? "",
    bodyText: t.body_text ?? t.body_preview ?? "",
    footerText: t.footer_text ?? "",
    buttons: Array.isArray(t.buttons) ? t.buttons : [],
    variableSamples: t.variable_samples ?? {},
  };
}
