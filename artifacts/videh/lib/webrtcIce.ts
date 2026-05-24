/** Shared STUN fallback when server ICE config is unavailable. */
export const VIDEH_ICE_SERVERS_FALLBACK = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

/** @deprecated use loadIceServers() */
export const VIDEH_ICE_SERVERS = VIDEH_ICE_SERVERS_FALLBACK;

let cachedIce: RTCIceServer[] | null = null;
let cacheAt = 0;
const CACHE_MS = 5 * 60 * 1000;

export function peerChannel(baseChannel: string, localUserId: number, remoteUserId: number): string {
  if (!remoteUserId || localUserId === remoteUserId) return baseChannel;
  const a = Math.min(localUserId, remoteUserId);
  const b = Math.max(localUserId, remoteUserId);
  return `${baseChannel}_peer_${a}_${b}`;
}

export async function loadIceServers(sessionToken?: string | null): Promise<RTCIceServer[]> {
  if (cachedIce && Date.now() - cacheAt < CACHE_MS) return cachedIce;
  try {
    const { getApiUrl } = require("./api") as typeof import("./api");
    const res = await fetch(`${getApiUrl()}/api/webrtc/ice-config`, {
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
    });
    const data = await res.json() as { success?: boolean; iceServers?: RTCIceServer[] };
    if (data.success && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      cachedIce = data.iceServers;
      cacheAt = Date.now();
      return cachedIce;
    }
  } catch {
    /* use fallback */
  }
  return VIDEH_ICE_SERVERS_FALLBACK;
}
