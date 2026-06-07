import AsyncStorage from "@react-native-async-storage/async-storage";

export type ReelsVideoQuality = "auto" | 1080 | 720 | 480 | 360 | 240 | 144;

export const REELS_QUALITY_OPTIONS: ReelsVideoQuality[] = [
  "auto",
  1080,
  720,
  480,
  360,
  240,
  144,
];

const perVideoKey = (videoId: number) => `reels_quality_video_${videoId}`;

export function qualityLabel(q: ReelsVideoQuality): string {
  if (q === "auto") return "Auto (recommended)";
  if (q === 1080) return "1080p";
  if (q === 720) return "720p";
  return `${q}p`;
}

export function isReelsApiStreamUrl(url: string): boolean {
  const base = url.split("?")[0];
  return /\/api\/reels\/videos\/\d+\/stream$/i.test(base);
}

/** Qualities this specific video can offer (YouTube: only what the upload supports). */
export function qualitiesForVideo(
  sourceHeight?: number | null,
  playbackUrl?: string | null,
): ReelsVideoQuality[] {
  if (!playbackUrl || !isReelsApiStreamUrl(playbackUrl)) {
    return ["auto"];
  }
  const max = sourceHeight && sourceHeight > 0 ? sourceHeight : 1080;
  return REELS_QUALITY_OPTIONS.filter((q) => q === "auto" || q <= max);
}

export function clampQualityToAvailable(
  quality: ReelsVideoQuality,
  available: ReelsVideoQuality[],
): ReelsVideoQuality {
  if (available.includes(quality)) return quality;
  return "auto";
}

export function applyQualityToPlaybackUrl(url: string, quality: ReelsVideoQuality): string {
  const [base, query = ""] = url.split("?");
  if (!isReelsApiStreamUrl(url)) return url;
  if (quality === "auto") {
    if (!query) return base;
    const params = new URLSearchParams(query);
    params.delete("maxHeight");
    const rest = params.toString();
    return rest ? `${base}?${rest}` : base;
  }
  return `${base}?maxHeight=${quality}`;
}

/** Last quality chosen for this video only (not global). */
export async function loadVideoQualityPref(
  videoId: number,
  available: ReelsVideoQuality[],
): Promise<ReelsVideoQuality> {
  try {
    const raw = await AsyncStorage.getItem(perVideoKey(videoId));
    if (!raw || raw === "auto") return "auto";
    const n = Number(raw);
    if (REELS_QUALITY_OPTIONS.includes(n as ReelsVideoQuality)) {
      return clampQualityToAvailable(n as ReelsVideoQuality, available);
    }
  } catch { /* ignore */ }
  return "auto";
}

export async function saveVideoQualityPref(
  videoId: number,
  quality: ReelsVideoQuality,
): Promise<void> {
  await AsyncStorage.setItem(perVideoKey(videoId), String(quality));
}

export async function clearVideoQualityPref(videoId: number): Promise<void> {
  try {
    await AsyncStorage.removeItem(perVideoKey(videoId));
  } catch { /* ignore */ }
}
