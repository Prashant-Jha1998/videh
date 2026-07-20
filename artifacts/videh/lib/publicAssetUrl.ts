import { getApiUrl } from "./api";

/** Resolve /uploads/... paths to absolute URLs for Image components. */
export function resolvePublicAssetUrl(url?: string | null): string | undefined {
  const raw = (url ?? "").trim();
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) return raw;
  const base = getApiUrl().replace(/\/$/, "");
  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`;
}

/**
 * Append session token (+ optional statusId) for private status media.
 * statusId lets the server authorize other viewers via the status they already opened.
 */
export function withStatusMediaAuth(
  url?: string | null,
  sessionToken?: string | null,
  statusId?: string | number | null,
): string | undefined {
  const resolved = resolvePublicAssetUrl(url);
  if (!resolved) return undefined;
  if (!resolved.includes("/api/statuses/media/")) return resolved;
  try {
    const u = new URL(resolved);
    if (sessionToken && !u.searchParams.has("token")) {
      u.searchParams.set("token", sessionToken);
    }
    if (statusId != null && String(statusId).trim() !== "" && !u.searchParams.has("statusId")) {
      u.searchParams.set("statusId", String(statusId));
    }
    return u.toString();
  } catch {
    let out = resolved;
    if (sessionToken && !/[?&]token=/.test(out)) {
      out += `${out.includes("?") ? "&" : "?"}token=${encodeURIComponent(sessionToken)}`;
    }
    if (statusId != null && String(statusId).trim() !== "" && !/[?&]statusId=/.test(out)) {
      out += `${out.includes("?") ? "&" : "?"}statusId=${encodeURIComponent(String(statusId))}`;
    }
    return out;
  }
}
