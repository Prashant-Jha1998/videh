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
 * Ensure status media paths use `/content` so the URI does not end in `.jpg`/`.png`.
 * nginx on videh.co.in had a static-asset regex that returned HTML 404 for those paths.
 */
export function ensureStatusMediaContentPath(url: string): string {
  const raw = url.trim();
  if (!raw.includes("/api/statuses/media/")) return raw;
  try {
    const u = new URL(raw, getApiUrl());
    let path = u.pathname.replace(/\/+$/, "");
    if (!path.includes("/api/statuses/media/")) return raw;
    if (!path.endsWith("/content")) {
      path = `${path}/content`;
    }
    u.pathname = path;
    return u.toString();
  } catch {
    const [base, qs] = raw.split("?");
    const path = (base ?? raw).replace(/\/+$/, "");
    if (path.includes("/api/statuses/media/") && !path.endsWith("/content")) {
      return qs ? `${path}/content?${qs}` : `${path}/content`;
    }
    return raw;
  }
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
  const withContent = ensureStatusMediaContentPath(resolved);
  try {
    const u = new URL(withContent);
    if (sessionToken && !u.searchParams.has("token")) {
      u.searchParams.set("token", sessionToken);
    }
    if (statusId != null && String(statusId).trim() !== "" && !u.searchParams.has("statusId")) {
      u.searchParams.set("statusId", String(statusId));
    }
    return u.toString();
  } catch {
    let out = withContent;
    if (sessionToken && !/[?&]token=/.test(out)) {
      out += `${out.includes("?") ? "&" : "?"}token=${encodeURIComponent(sessionToken)}`;
    }
    if (statusId != null && String(statusId).trim() !== "" && !/[?&]statusId=/.test(out)) {
      out += `${out.includes("?") ? "&" : "?"}statusId=${encodeURIComponent(String(statusId))}`;
    }
    return out;
  }
}
