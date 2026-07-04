/** Videh short-form vertical videos — unique product name (not "reels" / "shorts"). */
export const VIBE_BRAND_NAME = "Vibe";

/** Max duration for a Vibe clip (seconds). Longer uploads are Watch (long-form). */
export const VIBE_MAX_DURATION_SECONDS = 60;

export type VideoFormat = "watch" | "vibe";

export function isVibeVideo(durationSeconds: number, format?: string | null): boolean {
  if (format === "vibe") return true;
  if (format === "watch") return false;
  return durationSeconds > 0 && durationSeconds <= VIBE_MAX_DURATION_SECONDS;
}

export function isWatchVideo(durationSeconds: number, format?: string | null): boolean {
  if (format === "watch") return true;
  if (format === "vibe") return false;
  return durationSeconds > VIBE_MAX_DURATION_SECONDS;
}

/** Monetization: valid public Vibe views required in rolling 90 days. */
export const VIBE_MONETIZATION_VIEWS_90D = 5_000_000;

/** Vibe feed thumbnail — vertical 9:16 (not Watch 16:9). */
export const VIBE_THUMB_WIDTH = 720;
export const VIBE_THUMB_HEIGHT = 1280;
export const VIBE_THUMB_ASPECT = 9 / 16;
