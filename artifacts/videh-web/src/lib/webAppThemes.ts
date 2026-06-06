export type AppThemeOption = {
  id: string;
  name: string;
  kind: "solid" | "gradient";
  colors: [string, string];
};

export const DEFAULT_APP_THEME_ID = "videh-green";
export const APP_THEME_TRIAL_DAYS = 365;

export const SOLID_APP_THEMES: AppThemeOption[] = [
  { id: "videh-green", name: "Videh Green", kind: "solid", colors: ["#00A884", "#00A884"] },
  { id: "emerald", name: "Emerald", kind: "solid", colors: ["#10B981", "#10B981"] },
  { id: "teal", name: "Teal", kind: "solid", colors: ["#14B8A6", "#14B8A6"] },
  { id: "blue", name: "Blue", kind: "solid", colors: ["#2563EB", "#2563EB"] },
  { id: "violet", name: "Violet", kind: "solid", colors: ["#7C3AED", "#7C3AED"] },
  { id: "rose", name: "Rose", kind: "solid", colors: ["#E11D48", "#E11D48"] },
  { id: "slate", name: "Slate", kind: "solid", colors: ["#475569", "#475569"] },
  { id: "black", name: "Midnight", kind: "solid", colors: ["#111827", "#111827"] },
];

export const GRADIENT_APP_THEMES: AppThemeOption[] = [
  { id: "aurora", name: "Aurora", kind: "gradient", colors: ["#00A884", "#06B6D4"] },
  { id: "royal", name: "Royal", kind: "gradient", colors: ["#2563EB", "#7C3AED"] },
  { id: "sunset", name: "Sunset", kind: "gradient", colors: ["#F97316", "#DB2777"] },
  { id: "forest", name: "Forest", kind: "gradient", colors: ["#166534", "#0D9488"] },
  { id: "cosmic", name: "Cosmic", kind: "gradient", colors: ["#0F172A", "#C026D3"] },
];

export const APP_THEME_OPTIONS = [...SOLID_APP_THEMES, ...GRADIENT_APP_THEMES];

export function getAppThemeById(id?: string | null): AppThemeOption {
  return APP_THEME_OPTIONS.find((t) => t.id === id) ?? APP_THEME_OPTIONS[0];
}

export function daysLeftInThemeTrial(startedAtIso?: string | null, now = Date.now()): number {
  if (!startedAtIso) return APP_THEME_TRIAL_DAYS;
  const startedAt = new Date(startedAtIso).getTime();
  if (!Number.isFinite(startedAt)) return APP_THEME_TRIAL_DAYS;
  const elapsedDays = Math.floor((now - startedAt) / 86400000);
  return Math.max(APP_THEME_TRIAL_DAYS - elapsedDays, 0);
}

export function applyWebTheme(theme: AppThemeOption) {
  const root = document.documentElement;
  root.style.setProperty("--videh-primary", theme.colors[0]);
  root.style.setProperty("--videh-primary-end", theme.colors[1]);
}
