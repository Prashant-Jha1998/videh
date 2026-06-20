/**
 * Structured location payloads (Videh-style) stored in message `content` as JSON.
 * `mediaUrl` remains a Google Maps link for tap-to-open.
 */

import { Linking, Platform } from "react-native";

export type LocationMessagePayload = {
  v: 1;
  mode: "static" | "live";
  lat: number;
  lng: number;
  /** Human label (area / place name) */
  label?: string;
  /** Live only — epoch ms when sharing ends */
  until?: number;
  /** Optional caption from "Add comment" */
  comment?: string;
  /** User ended live share early */
  stopped?: boolean;
};

export function mapsUrl(lat: number, lng: number): string {
  return googleMapsSearchUrl(lat, lng);
}

/** Browser / fallback — opens pin at coordinates. */
export function googleMapsSearchUrl(lat: number, lng: number): string {
  const query = `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Android turn-by-turn when Google Maps is installed. */
export function googleMapsNavigationUrl(lat: number, lng: number): string {
  return `google.navigation:q=${lat},${lng}`;
}

const mapPreviewCache = new Map<string, string>();

export function cacheMapPreviewKey(lat: number, lng: number, width: number, height: number): string {
  return `${lat.toFixed(5)}:${lng.toFixed(5)}:${width}x${height}`;
}

export function rememberMapPreviewUrl(lat: number, lng: number, width: number, height: number, url: string): void {
  mapPreviewCache.set(cacheMapPreviewKey(lat, lng, width, height), url);
}

export function cachedMapPreviewUrl(
  lat: number,
  lng: number,
  width: number,
  height: number,
): string | undefined {
  return mapPreviewCache.get(cacheMapPreviewKey(lat, lng, width, height));
}

export function isLiveLocationActive(payload: LocationMessagePayload | null | undefined): boolean {
  if (!payload || payload.mode !== "live" || payload.stopped) return false;
  if (payload.until != null && payload.until <= Date.now()) return false;
  return true;
}

export function isLiveLocationEnded(payload: LocationMessagePayload | null | undefined): boolean {
  if (!payload || payload.mode !== "live") return false;
  if (payload.stopped) return true;
  if (payload.until != null && payload.until <= Date.now()) return true;
  return false;
}

/** Notification / chat-list preview — never raw JSON or coordinates. */
export function locationChatPreview(raw: string): string {
  const parsed = parseLocationPayload(raw);
  if (parsed) {
    if (parsed.mode === "live") {
      if (isLiveLocationEnded(parsed)) return "📍 Live location ended";
      return "📍 Shared live location";
    }
    return "📍 Shared a location";
  }
  if (parseLegacyLocation(raw)) return "📍 Shared a location";
  return "📍 Shared a location";
}

/** Address line on the location bubble — hide lat/lng from users. */
export function locationDisplayAddress(
  payload: LocationMessagePayload | null,
  legacyText?: string,
): string {
  const label = payload?.label?.trim();
  if (label && !looksLikeCoordinatePair(label)) return label;

  const comment = payload?.comment?.trim();
  if (comment) return comment;

  if (legacyText) {
    const stripped = legacyText.replace(/^📍[^\n]*\n?/, "").trim();
    if (stripped && !looksLikeCoordinatePair(stripped)) return stripped;
  }

  return "Tap to open in Maps";
}

function looksLikeCoordinatePair(text: string): boolean {
  return /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(text.trim());
}

export function formatLiveRemaining(untilMs: number): string {
  const ms = Math.max(0, untilMs - Date.now());
  const mins = Math.ceil(ms / 60_000);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs} hr ${rem} min left` : `${hrs} hr left`;
  }
  return `${mins} min left`;
}

/** Open Google Maps navigation with browser fallback. */
export async function openLocationInMaps(lat: number, lng: number): Promise<void> {
  const searchUrl = googleMapsSearchUrl(lat, lng);

  if (Platform.OS === "android") {
    const navUrl = googleMapsNavigationUrl(lat, lng);
    const geoUrl = `geo:${lat},${lng}?q=${lat},${lng}`;
    try {
      await Linking.openURL(navUrl);
      return;
    } catch {
      /* try geo intent */
    }
    try {
      await Linking.openURL(geoUrl);
      return;
    } catch {
      /* fall through to HTTPS */
    }
  }

  if (Platform.OS === "ios") {
    const gmaps = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
    try {
      if (await Linking.canOpenURL(gmaps)) {
        await Linking.openURL(gmaps);
        return;
      }
    } catch {
      /* try Apple Maps */
    }
    try {
      await Linking.openURL(`http://maps.apple.com/?daddr=${lat},${lng}`);
      return;
    } catch {
      /* fall through */
    }
  }

  await Linking.openURL(searchUrl);
}

/** OSM static map image (no API key) with fallback mirror. */
export function staticMapImageUrl(lat: number, lng: number, width: number, height: number, zoom = 15): string {
  const w = Math.min(Math.round(width), 640);
  const h = Math.min(Math.round(height), 640);
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&maptype=mapnik&markers=${lat},${lng},red-pushpin`;
}

export function staticMapFallbackUrl(lat: number, lng: number, width: number, height: number, zoom = 15): string {
  const w = Math.min(Math.round(width), 640);
  const h = Math.min(Math.round(height), 640);
  return `https://staticmap.openstreetmap.fr/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&maptype=mapnik&markers=${lat},${lng},red-pushpin`;
}

export function encodeLocationPayload(p: LocationMessagePayload): string {
  return JSON.stringify(p);
}

export function parseLocationPayload(text: string): LocationMessagePayload | null {
  if (!text || typeof text !== "string") return null;
  const t = text.trim();
  if (!t.startsWith("{")) return null;
  try {
    const j = JSON.parse(t) as LocationMessagePayload;
    if (j?.v === 1 && (j.mode === "static" || j.mode === "live") && typeof j.lat === "number" && typeof j.lng === "number") {
      return j;
    }
  } catch {
    return null;
  }
  return null;
}

/** Legacy plain-text location messages */
export function parseLegacyLocation(text: string): { lat: number; lng: number } | null {
  if (!text.includes("📍")) return null;
  const m = text.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function formatLiveUntil(untilMs: number): string {
  const d = new Date(untilMs);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
