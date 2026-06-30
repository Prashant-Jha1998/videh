function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim();
  if (!raw.startsWith("#")) return null;
  let h = raw.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** True when a solid hex fill needs light foreground text. */
export function isColorDark(color: string): boolean {
  const parsed = parseHexColor(color);
  if (!parsed) return false;
  return relativeLuminance(parsed.r, parsed.g, parsed.b) < 0.45;
}

export function textColorForBubbleBackground(
  backgroundColor: string,
  opts?: { lightText?: string; darkText?: string },
): string {
  const light = opts?.lightText ?? "#FFFFFF";
  const dark = opts?.darkText ?? "#111111";
  return isColorDark(backgroundColor) ? light : dark;
}

export function mutedTextColorForBubbleBackground(
  backgroundColor: string,
  opts?: { lightMuted?: string; darkMuted?: string },
): string {
  const light = opts?.lightMuted ?? "rgba(255,255,255,0.72)";
  const dark = opts?.darkMuted ?? "rgba(0,0,0,0.55)";
  return isColorDark(backgroundColor) ? light : dark;
}

export function linkColorForBubbleBackground(
  backgroundColor: string,
  opts?: { lightLink?: string; darkLink?: string },
): string {
  const light = opts?.lightLink ?? "#93C5FD";
  const dark = opts?.darkLink ?? "#027EB5";
  return isColorDark(backgroundColor) ? light : dark;
}
