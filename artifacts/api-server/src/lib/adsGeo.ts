import { clientIp } from "./rateLimit";

export type ViewerGeo = {
  city: string;
  state: string;
  country: string;
};

const geoCache = new Map<string, ViewerGeo>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cacheTimes = new Map<string, number>();

function normalizeGeoPart(v: string | null | undefined, fallback: string): string {
  const t = String(v ?? "").trim();
  return t.length > 0 ? t.slice(0, 80) : fallback;
}

/** Best-effort geo from IP (ip-api.com). Falls back to Unknown on failure. */
export async function resolveViewerGeoFromIp(ip: string): Promise<ViewerGeo> {
  const key = ip || "unknown";
  const cached = geoCache.get(key);
  const at = cacheTimes.get(key) ?? 0;
  if (cached && Date.now() - at < CACHE_TTL_MS) return cached;

  const unknown: ViewerGeo = { city: "Unknown", state: "Unknown", country: "India" };
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip === "::1") {
    return unknown;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await res.json() as { status?: string; city?: string; regionName?: string; country?: string };
    if (data.status !== "success") {
      geoCache.set(key, unknown);
      cacheTimes.set(key, Date.now());
      return unknown;
    }
    const geo: ViewerGeo = {
      city: normalizeGeoPart(data.city, "Unknown"),
      state: normalizeGeoPart(data.regionName, "Unknown"),
      country: normalizeGeoPart(data.country, "India"),
    };
    geoCache.set(key, geo);
    cacheTimes.set(key, Date.now());
    return geo;
  } catch {
    geoCache.set(key, unknown);
    cacheTimes.set(key, Date.now());
    return unknown;
  }
}

export async function resolveViewerGeoFromRequest(req: {
  headers: Record<string, unknown>;
  socket?: { remoteAddress?: string | null };
  body?: { viewerCity?: string; viewerState?: string; viewerCountry?: string };
}): Promise<ViewerGeo> {
  const body = req.body as { viewerCity?: string; viewerState?: string; viewerCountry?: string } | undefined;
  if (body?.viewerCity?.trim()) {
    return {
      city: normalizeGeoPart(body.viewerCity, "Unknown"),
      state: normalizeGeoPart(body.viewerState, "Unknown"),
      country: normalizeGeoPart(body.viewerCountry, "India"),
    };
  }
  const cfCity = req.headers["cf-ipcity"];
  if (typeof cfCity === "string" && cfCity.trim()) {
    return {
      city: normalizeGeoPart(cfCity, "Unknown"),
      state: normalizeGeoPart(String(req.headers["cf-region"] ?? ""), "Unknown"),
      country: normalizeGeoPart(String(req.headers["cf-ipcountry"] ?? "India"), "India"),
    };
  }
  return resolveViewerGeoFromIp(clientIp(req));
}
