import { packs, SUPPORTED_UI_LOCALES } from "./i18n/packs";

export { SUPPORTED_UI_LOCALES };

export function translate(locale: string, key: string): string {
  const code = (locale || "en").split("-")[0] ?? "en";
  const primary = packs[code];
  const out = primary?.[key] ?? packs.en[key];
  return out ?? key;
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}
