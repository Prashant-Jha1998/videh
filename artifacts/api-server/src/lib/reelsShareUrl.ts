function videoPublicBase(): string {
  const videoHost = (process.env["PUBLIC_VIDEO_DOMAIN"] || "video.videh.co.in").trim();
  return /^https?:\/\//i.test(videoHost)
    ? videoHost.replace(/\/+$/, "")
    : `https://${videoHost}`;
}

function normalizeChannelHandle(handle: string): string {
  return handle.replace(/^@+/, "").trim().toLowerCase();
}

/** Public HTTPS watch URL — video.videh.co.in (web) with app deep link fallback via /api/reels/go. */
export function buildReelsVideoShareUrl(videoId: number | string): string {
  return `${videoPublicBase()}/watch/${videoId}`;
}

export function buildReelsVideoDeepLink(videoId: number | string): string {
  return `videh://reels/watch/${videoId}`;
}

/** Public channel page — opens in Videh Video web or app. */
export function buildReelsChannelShareUrl(handle: string): string {
  const h = normalizeChannelHandle(handle);
  return `${videoPublicBase()}/@${encodeURIComponent(h)}`;
}

export function buildReelsChannelDeepLink(handle: string): string {
  const h = normalizeChannelHandle(handle);
  return `videh://reels/channel/${encodeURIComponent(h)}`;
}

/** API landing page when shared outside the app (Play Store fallback + deep link). */
export function buildReelsChannelGoUrl(handle: string, apiOrigin?: string): string {
  const h = normalizeChannelHandle(handle);
  const origin = (apiOrigin ?? process.env["PUBLIC_API_ORIGIN"] ?? "https://videh.co.in").replace(/\/+$/, "");
  return `${origin}/api/reels/go/channel/${encodeURIComponent(h)}`;
}
