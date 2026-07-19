import { getApiUrl } from "./api";

/** Resolve /uploads/... paths to absolute URLs for Image components. */
export function resolvePublicAssetUrl(url?: string | null): string | undefined {
  const raw = (url ?? "").trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  const base = getApiUrl().replace(/\/$/, "");
  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`;
}

/** Append session token for private status media (Image/Video cannot always send Authorization). */
export function withStatusMediaAuth(url?: string | null, sessionToken?: string | null): string | undefined {
  const resolved = resolvePublicAssetUrl(url);
  if (!resolved || !sessionToken) return resolved;
  if (!resolved.includes("/api/statuses/media/")) return resolved;
  if (/[?&]token=/.test(resolved)) return resolved;
  const sep = resolved.includes("?") ? "&" : "?";
  return `${resolved}${sep}token=${encodeURIComponent(sessionToken)}`;
}
