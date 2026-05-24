import { getApiUrl } from "./api";

/** Resolve /uploads/... paths to absolute URLs for Image components. */
export function resolvePublicAssetUrl(url?: string | null): string | undefined {
  const raw = (url ?? "").trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  const base = getApiUrl().replace(/\/$/, "");
  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`;
}
