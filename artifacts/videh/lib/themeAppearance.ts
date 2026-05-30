import {
  APP_THEME_OPTIONS,
  DEFAULT_APP_THEME_ID,
  getAppThemeById,
  type AppThemeKind,
  type AppThemeOption,
} from "@/lib/appThemes";

export type ThemePackId =
  | "classic"
  | "amoled"
  | "neon"
  | "gold"
  | "gradient"
  | "festival"
  | "custom";

export type AnimatedWallpaperId =
  | "none"
  | "aurora"
  | "neon-pulse"
  | "sunset-flow"
  | "amoled-glow"
  | "festival-lights";

export type AppIconStyleId =
  | "default"
  | "green"
  | "black"
  | "gold"
  | "blue"
  | "purple";

/** Full app look derived from a theme (Meta-style advanced theming). */
export type ThemeAppearance = {
  id: string;
  name: string;
  pack: ThemePackId;
  kind: AppThemeKind;
  accent: [string, string];
  bubbleSentLight: string;
  bubbleReceivedLight: string;
  bubbleSentDark: string;
  bubbleReceivedDark: string;
  chatBackgroundLight: string;
  chatBackgroundDark: string;
  premium?: boolean;
  animatedWallpaper?: AnimatedWallpaperId;
};

export type BubbleOverride = {
  sentLight?: string;
  receivedLight?: string;
  sentDark?: string;
  receivedDark?: string;
};

export const THEME_PACK_META: Record<
  ThemePackId,
  { title: string; subtitle: string; icon: string }
> = {
  classic: { title: "Classic", subtitle: "Videh greens & basics", icon: "leaf-outline" },
  amoled: { title: "AMOLED Black", subtitle: "Pure black, battery friendly", icon: "moon-outline" },
  neon: { title: "Dark Neon", subtitle: "Glow accents on dark", icon: "flash-outline" },
  gold: { title: "Gold", subtitle: "Premium metallic look", icon: "diamond-outline" },
  gradient: { title: "Gradients", subtitle: "Smooth color blends", icon: "color-palette-outline" },
  festival: { title: "Festival", subtitle: "Diwali, Holi & celebrations", icon: "sparkles-outline" },
  custom: { title: "Custom", subtitle: "Your bubble picks", icon: "brush-outline" },
};

export const ANIMATED_WALLPAPERS: { id: AnimatedWallpaperId; name: string }[] = [
  { id: "none", name: "Off" },
  { id: "aurora", name: "Aurora" },
  { id: "neon-pulse", name: "Neon Pulse" },
  { id: "sunset-flow", name: "Sunset Flow" },
  { id: "amoled-glow", name: "AMOLED Glow" },
  { id: "festival-lights", name: "Festival Lights" },
];

export const APP_ICON_STYLES: { id: AppIconStyleId; name: string; color: string }[] = [
  { id: "default", name: "Videh Green", color: "#00A884" },
  { id: "green", name: "Green", color: "#25D366" },
  { id: "black", name: "Black", color: "#111827" },
  { id: "gold", name: "Gold", color: "#CA8A04" },
  { id: "blue", name: "Blue", color: "#2563EB" },
  { id: "purple", name: "Purple", color: "#7C3AED" },
];

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(a: string, b: string, t: number): string {
  const c1 = parseHex(a);
  const c2 = parseHex(b);
  if (!c1 || !c2) return a;
  return toHex(
    c1.r + (c2.r - c1.r) * t,
    c1.g + (c2.g - c1.g) * t,
    c1.b + (c2.b - c1.b) * t,
  );
}

/** Derive WhatsApp-style bubbles from accent when not explicitly set. */
export function deriveBubblesFromAccent(accent: string): Pick<
  ThemeAppearance,
  "bubbleSentLight" | "bubbleReceivedLight" | "bubbleSentDark" | "bubbleReceivedDark"
> {
  return {
    bubbleSentLight: mixHex(accent, "#FFFFFF", 0.78),
    bubbleReceivedLight: "#FFFFFF",
    bubbleSentDark: mixHex(accent, "#0B141A", 0.55),
    bubbleReceivedDark: "#1F2C34",
  };
}

const PREMIUM_OVERRIDES: Partial<
  Record<string, Partial<ThemeAppearance> & { pack: ThemePackId }>
> = {
  black: {
    pack: "amoled",
    bubbleSentLight: "#2A3942",
    bubbleReceivedLight: "#1A2329",
    bubbleSentDark: "#005C4B",
    bubbleReceivedDark: "#1F2C34",
    chatBackgroundLight: "#E5DDD5",
    chatBackgroundDark: "#000000",
    premium: true,
  },
  neon: {
    pack: "neon",
    bubbleSentLight: "#DCFCE7",
    bubbleReceivedLight: "#FFFFFF",
    bubbleSentDark: "#14532D",
    bubbleReceivedDark: "#0F172A",
    chatBackgroundDark: "#020617",
    animatedWallpaper: "neon-pulse",
    premium: true,
  },
  gold: {
    pack: "gold",
    bubbleSentLight: "#FEF3C7",
    bubbleReceivedLight: "#FFFFFF",
    bubbleSentDark: "#78350F",
    bubbleReceivedDark: "#1C1917",
    chatBackgroundDark: "#0C0A09",
    premium: true,
  },
  cosmic: {
    pack: "neon",
    bubbleSentLight: "#F3E8FF",
    bubbleReceivedLight: "#FFFFFF",
    bubbleSentDark: "#581C87",
    bubbleReceivedDark: "#0F172A",
    chatBackgroundDark: "#0F172A",
    animatedWallpaper: "aurora",
    premium: true,
  },
  "deep-sea": {
    pack: "gradient",
    bubbleSentDark: "#0C4A6E",
    bubbleReceivedDark: "#0F172A",
    premium: true,
  },
  sunset: { pack: "festival", animatedWallpaper: "sunset-flow", premium: true },
  flame: { pack: "festival", animatedWallpaper: "festival-lights", premium: true },
  candy: { pack: "festival", premium: true },
  firefly: { pack: "festival", animatedWallpaper: "festival-lights", premium: true },
};

function fromAppTheme(opt: AppThemeOption): ThemeAppearance {
  const accent = opt.colors[0];
  const bubbles = deriveBubblesFromAccent(accent);
  const override = PREMIUM_OVERRIDES[opt.id];
  const pack =
    override?.pack
    ?? (opt.kind === "gradient" ? "gradient" : "classic");

  return {
    id: opt.id,
    name: opt.name,
    pack,
    kind: opt.kind,
    accent: opt.colors,
    chatBackgroundLight: override?.chatBackgroundLight ?? "#E5DDD5",
    chatBackgroundDark: override?.chatBackgroundDark ?? "#0B141A",
    animatedWallpaper: override?.animatedWallpaper,
    premium: override?.premium,
    ...bubbles,
    ...(override?.bubbleSentLight ? { bubbleSentLight: override.bubbleSentLight } : {}),
    ...(override?.bubbleReceivedLight ? { bubbleReceivedLight: override.bubbleReceivedLight } : {}),
    ...(override?.bubbleSentDark ? { bubbleSentDark: override.bubbleSentDark } : {}),
    ...(override?.bubbleReceivedDark ? { bubbleReceivedDark: override.bubbleReceivedDark } : {}),
  };
}

const ALL_APPEARANCES: ThemeAppearance[] = APP_THEME_OPTIONS.map(fromAppTheme);

export function getThemeAppearanceById(id?: string | null): ThemeAppearance {
  return ALL_APPEARANCES.find((t) => t.id === id) ?? fromAppTheme(getAppThemeById(DEFAULT_APP_THEME_ID));
}

export function listAppearancesByPack(pack: ThemePackId): ThemeAppearance[] {
  if (pack === "custom") return [];
  return ALL_APPEARANCES.filter((t) => t.pack === pack);
}

export function listPremiumPacks(): { pack: ThemePackId; themes: ThemeAppearance[] }[] {
  const packs: ThemePackId[] = ["amoled", "neon", "gold", "gradient", "festival"];
  return packs.map((pack) => ({
    pack,
    themes: ALL_APPEARANCES.filter((t) => t.pack === pack && t.premium),
  })).filter((p) => p.themes.length > 0);
}

export function resolveBubbles(
  appearance: ThemeAppearance,
  isDark: boolean,
  override?: BubbleOverride | null,
): { sent: string; received: string } {
  if (isDark) {
    return {
      sent: override?.sentDark ?? appearance.bubbleSentDark,
      received: override?.receivedDark ?? appearance.bubbleReceivedDark,
    };
  }
  return {
    sent: override?.sentLight ?? appearance.bubbleSentLight,
    received: override?.receivedLight ?? appearance.bubbleReceivedLight,
  };
}

export function resolveChatBackground(
  appearance: ThemeAppearance,
  isDark: boolean,
  globalWallpaperColor: string | null,
): string {
  if (globalWallpaperColor) return globalWallpaperColor;
  return isDark ? appearance.chatBackgroundDark : appearance.chatBackgroundLight;
}
