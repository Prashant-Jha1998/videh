/** Public HTTPS watch URL — video.videh.co.in (web) with app deep link fallback via /api/reels/go. */
export function buildReelsVideoShareUrl(videoId: number | string): string {
  const videoHost = (process.env["PUBLIC_VIDEO_DOMAIN"] || "video.videh.co.in").trim();
  const base = /^https?:\/\//i.test(videoHost)
    ? videoHost.replace(/\/+$/, "")
    : `https://${videoHost}`;
  return `${base}/watch/${videoId}`;
}

export function buildReelsVideoDeepLink(videoId: number | string): string {
  return `videh://reels/watch/${videoId}`;
}
