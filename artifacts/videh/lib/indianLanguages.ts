import { SUPPORTED_UI_LOCALES } from "@/lib/i18n/packs";

/** Indian language codes supported for group auto-translate (keep in sync with API). */
export const INDIAN_LANGUAGE_OPTIONS = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "ur", name: "Urdu", native: "اردو" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "as", name: "Assamese", native: "অসমীয়া" },
] as const;

/** Settings → Language: only locales with shipped UI string packs. */
export const UI_LANGUAGE_OPTIONS = INDIAN_LANGUAGE_OPTIONS.filter((l) =>
  SUPPORTED_UI_LOCALES.includes(l.code),
);

export function languageDisplayName(code: string | null | undefined): string {
  const hit = INDIAN_LANGUAGE_OPTIONS.find((l) => l.code === code);
  return hit ? `${hit.name}` : code ?? "Unknown";
}

export function languageNativeLabel(code: string | null | undefined): string {
  const hit = INDIAN_LANGUAGE_OPTIONS.find((l) => l.code === code);
  if (!hit) return code ?? "";
  return `${hit.native} (${hit.name})`;
}
