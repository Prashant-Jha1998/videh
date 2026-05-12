export type AppThemeKind = "solid" | "gradient";

export type AppThemeOption = {
  id: string;
  name: string;
  kind: AppThemeKind;
  colors: [string, string];
};

export const DEFAULT_APP_THEME_ID = "videh-green";
export const APP_THEME_TRIAL_DAYS = 365;

export const SOLID_APP_THEMES: AppThemeOption[] = [
  { id: "videh-green", name: "Videh Green", kind: "solid", colors: ["#00A884", "#00A884"] },
  { id: "emerald", name: "Emerald", kind: "solid", colors: ["#10B981", "#10B981"] },
  { id: "teal", name: "Teal", kind: "solid", colors: ["#14B8A6", "#14B8A6"] },
  { id: "cyan", name: "Cyan", kind: "solid", colors: ["#06B6D4", "#06B6D4"] },
  { id: "sky", name: "Sky", kind: "solid", colors: ["#0EA5E9", "#0EA5E9"] },
  { id: "blue", name: "Blue", kind: "solid", colors: ["#2563EB", "#2563EB"] },
  { id: "indigo", name: "Indigo", kind: "solid", colors: ["#4F46E5", "#4F46E5"] },
  { id: "violet", name: "Violet", kind: "solid", colors: ["#7C3AED", "#7C3AED"] },
  { id: "purple", name: "Purple", kind: "solid", colors: ["#9333EA", "#9333EA"] },
  { id: "fuchsia", name: "Fuchsia", kind: "solid", colors: ["#C026D3", "#C026D3"] },
  { id: "pink", name: "Pink", kind: "solid", colors: ["#DB2777", "#DB2777"] },
  { id: "rose", name: "Rose", kind: "solid", colors: ["#E11D48", "#E11D48"] },
  { id: "red", name: "Red", kind: "solid", colors: ["#DC2626", "#DC2626"] },
  { id: "orange", name: "Orange", kind: "solid", colors: ["#EA580C", "#EA580C"] },
  { id: "amber", name: "Amber", kind: "solid", colors: ["#D97706", "#D97706"] },
  { id: "yellow", name: "Yellow", kind: "solid", colors: ["#CA8A04", "#CA8A04"] },
  { id: "lime", name: "Lime", kind: "solid", colors: ["#65A30D", "#65A30D"] },
  { id: "green", name: "Green", kind: "solid", colors: ["#16A34A", "#16A34A"] },
  { id: "slate", name: "Slate", kind: "solid", colors: ["#475569", "#475569"] },
  { id: "black", name: "Midnight", kind: "solid", colors: ["#111827", "#111827"] },
];

export const GRADIENT_APP_THEMES: AppThemeOption[] = [
  { id: "aurora", name: "Aurora", kind: "gradient", colors: ["#00A884", "#06B6D4"] },
  { id: "ocean", name: "Ocean", kind: "gradient", colors: ["#0EA5E9", "#14B8A6"] },
  { id: "royal", name: "Royal", kind: "gradient", colors: ["#2563EB", "#7C3AED"] },
  { id: "sunset", name: "Sunset", kind: "gradient", colors: ["#F97316", "#DB2777"] },
  { id: "flame", name: "Flame", kind: "gradient", colors: ["#EF4444", "#F59E0B"] },
  { id: "berry", name: "Berry", kind: "gradient", colors: ["#BE185D", "#7C3AED"] },
  { id: "mint", name: "Mint", kind: "gradient", colors: ["#10B981", "#84CC16"] },
  { id: "lagoon", name: "Lagoon", kind: "gradient", colors: ["#0891B2", "#0F766E"] },
  { id: "twilight", name: "Twilight", kind: "gradient", colors: ["#312E81", "#9333EA"] },
  { id: "peacock", name: "Peacock", kind: "gradient", colors: ["#0F766E", "#1D4ED8"] },
  { id: "candy", name: "Candy", kind: "gradient", colors: ["#EC4899", "#8B5CF6"] },
  { id: "firefly", name: "Firefly", kind: "gradient", colors: ["#16A34A", "#EAB308"] },
  { id: "coral", name: "Coral", kind: "gradient", colors: ["#FB7185", "#F97316"] },
  { id: "ice", name: "Ice", kind: "gradient", colors: ["#38BDF8", "#818CF8"] },
  { id: "forest", name: "Forest", kind: "gradient", colors: ["#166534", "#0D9488"] },
  { id: "grape", name: "Grape", kind: "gradient", colors: ["#7E22CE", "#DB2777"] },
  { id: "copper", name: "Copper", kind: "gradient", colors: ["#B45309", "#DC2626"] },
  { id: "deep-sea", name: "Deep Sea", kind: "gradient", colors: ["#0F172A", "#0284C7"] },
  { id: "neon", name: "Neon", kind: "gradient", colors: ["#22C55E", "#A3E635"] },
  { id: "orchid", name: "Orchid", kind: "gradient", colors: ["#A855F7", "#EC4899"] },
  { id: "sapphire", name: "Sapphire", kind: "gradient", colors: ["#1D4ED8", "#06B6D4"] },
  { id: "ruby", name: "Ruby", kind: "gradient", colors: ["#BE123C", "#F43F5E"] },
  { id: "gold", name: "Gold", kind: "gradient", colors: ["#CA8A04", "#F97316"] },
  { id: "jade", name: "Jade", kind: "gradient", colors: ["#047857", "#22C55E"] },
  { id: "storm", name: "Storm", kind: "gradient", colors: ["#334155", "#6366F1"] },
  { id: "watermelon", name: "Watermelon", kind: "gradient", colors: ["#16A34A", "#E11D48"] },
  { id: "lava", name: "Lava", kind: "gradient", colors: ["#7F1D1D", "#EA580C"] },
  { id: "cosmic", name: "Cosmic", kind: "gradient", colors: ["#0F172A", "#C026D3"] },
  { id: "tropical", name: "Tropical", kind: "gradient", colors: ["#14B8A6", "#F59E0B"] },
  { id: "dream", name: "Dream", kind: "gradient", colors: ["#60A5FA", "#F0ABFC"] },
];

export const APP_THEME_OPTIONS = [...SOLID_APP_THEMES, ...GRADIENT_APP_THEMES];

export function getAppThemeById(id?: string | null): AppThemeOption {
  return APP_THEME_OPTIONS.find((theme) => theme.id === id) ?? APP_THEME_OPTIONS[0];
}

export function daysLeftInThemeTrial(startedAtIso?: string | null, now = Date.now()): number {
  if (!startedAtIso) return APP_THEME_TRIAL_DAYS;
  const startedAt = new Date(startedAtIso).getTime();
  if (!Number.isFinite(startedAt)) return APP_THEME_TRIAL_DAYS;
  const elapsedDays = Math.floor((now - startedAt) / 86400000);
  return Math.max(APP_THEME_TRIAL_DAYS - elapsedDays, 0);
}
