/**
 * Structured location payloads (WhatsApp-style) stored in message `content` as JSON.
 * `mediaUrl` remains a Google Maps link for tap-to-open.
 */

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
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/** OSM static map image (no API key). */
export function staticMapImageUrl(lat: number, lng: number, width: number, height: number, zoom = 15): string {
  const w = Math.min(Math.round(width), 640);
  const h = Math.min(Math.round(height), 640);
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&maptype=mapnik`;
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
