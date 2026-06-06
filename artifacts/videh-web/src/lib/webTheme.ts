import { getAppThemeById } from "./webAppThemes";
import type { BubbleOverride } from "./webBubblePresets";
import {
  getThemeAppearanceById,
  resolveBubbles,
  resolveChatBackground,
  type AnimatedWallpaperId,
} from "./webThemeAppearance";
import { loadString, saveString, WEB_PREFS } from "./webLocalPrefs";

export const THEME_CHANGE_EVENT = "videh-theme-change";

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

function darken(hex: string, amount: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const f = 1 - amount;
  const r = Math.round(c.r * f);
  const g = Math.round(c.g * f);
  const b = Math.round(c.b * f);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const c = parseHex(hex);
  if (!c) return `rgba(0, 168, 132, ${alpha})`;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

export function loadBubbleOverride(): BubbleOverride | null {
  try {
    const raw = loadString(WEB_PREFS.bubbleOverride, "");
    if (!raw) return null;
    return JSON.parse(raw) as BubbleOverride;
  } catch {
    return null;
  }
}

export function saveBubbleOverride(override: BubbleOverride | null) {
  saveString(WEB_PREFS.bubbleOverride, override ? JSON.stringify(override) : "");
  applyWebThemeFromPrefs();
}

export function getAnimatedWallpaper(): AnimatedWallpaperId {
  const raw = loadString(WEB_PREFS.animatedWallpaper, "none");
  const allowed = new Set(["none", "aurora", "neon-pulse", "sunset-flow", "amoled-glow", "festival-lights"]);
  return allowed.has(raw) ? (raw as AnimatedWallpaperId) : "none";
}

export function saveAnimatedWallpaper(id: AnimatedWallpaperId) {
  saveString(WEB_PREFS.animatedWallpaper, id);
  applyWebThemeFromPrefs();
}

export function applyWebThemeFromPrefs() {
  const themeId = loadString(WEB_PREFS.appThemeId, "videh-green");
  const theme = getAppThemeById(themeId);
  const appearance = getThemeAppearanceById(themeId);
  const bubbleOverride = loadBubbleOverride();
  const wallpaper = getAnimatedWallpaper();
  const bubbles = resolveBubbles(appearance, false, bubbleOverride);
  const chatBg = resolveChatBackground(appearance, false, null);

  const [c0, c1] = theme.colors;
  const primaryDark = theme.kind === "gradient" ? darken(c1, 0.08) : darken(c0, 0.12);
  const accentGradient =
    theme.kind === "gradient"
      ? `linear-gradient(135deg, ${c0} 0%, ${c1} 100%)`
      : `linear-gradient(135deg, ${c0} 0%, ${primaryDark} 100%)`;

  const root = document.documentElement;
  root.style.setProperty("--vw-primary", c0);
  root.style.setProperty("--vw-primary-end", c1);
  root.style.setProperty("--vw-primary-dark", primaryDark);
  root.style.setProperty("--vw-primary-soft", hexToRgba(c0, 0.14));
  root.style.setProperty("--vw-primary-ring", hexToRgba(c0, 0.28));
  root.style.setProperty("--vw-accent-gradient", accentGradient);
  root.style.setProperty("--vw-bubble-sent", bubbles.sent);
  root.style.setProperty("--vw-bubble-received", bubbles.received);
  root.style.setProperty("--vw-chat-bg", chatBg);

  root.style.setProperty("--vs-primary", c0);
  root.style.setProperty("--vs-primary-dark", primaryDark);
  root.style.setProperty("--vs-primary-soft", hexToRgba(c0, 0.1));
  root.style.setProperty("--vs-primary-ring", hexToRgba(c0, 0.28));
  root.style.setProperty("--header-bg", c0);

  root.dataset.wallpaper = wallpaper;
  root.dataset.themeKind = theme.kind;

  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
}

export function initWebTheme() {
  applyWebThemeFromPrefs();
}

/** @deprecated Use applyWebThemeFromPrefs */
export function applyWebTheme(theme: ReturnType<typeof getAppThemeById>) {
  saveString(WEB_PREFS.appThemeId, theme.id);
  applyWebThemeFromPrefs();
}
