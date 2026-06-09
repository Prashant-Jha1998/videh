/** Public HTTPS link — opens Videh app or landing page (YouTube-style share URL). */
export function buildReelsVideoShareUrl(videoId: number | string): string {
  const domain = (
    process.env["PUBLIC_API_DOMAIN"]
    || process.env["EXPO_PUBLIC_DOMAIN"]
    || "videh.co.in"
  ).trim();
  const base = /^https?:\/\//i.test(domain) ? domain.replace(/\/+$/, "") : `https://${domain}`;
  return `${base}/api/reels/go/${videoId}`;
}

export function buildReelsVideoDeepLink(videoId: number | string): string {
  return `videh://reels/watch/${videoId}`;
}
