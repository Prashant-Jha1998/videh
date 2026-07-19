/** STUN-only client fallback when server ICE config is unavailable. No public TURN secrets. */
export const VIDEH_ICE_SERVERS_FALLBACK: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
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

/** Signaling channels for WebRTC. 1:1 calls always use the server call channel; mesh peer suffixes only for 3+ party. */
export function channelsForCall(
  baseChannel: string,
  localUserId: number,
  remotePeerIds: number[],
): string[] {
  if (!baseChannel) return [];
  if (remotePeerIds.length <= 1) return [baseChannel];
  return remotePeerIds.map((peerId) => peerChannel(baseChannel, localUserId, peerId));
}

export function peerIdFromCallChannel(channel: string, localUid: number): number {
  const m = channel.match(/_peer_(\d+)_(\d+)$/);
  if (!m) return 0;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === localUid) return b;
  if (b === localUid) return a;
  return 0;
}

export async function loadIceServers(sessionToken?: string | null): Promise<RTCIceServer[]> {
  if (cachedIce && Date.now() - cacheAt < CACHE_MS) return cachedIce;
  if (!sessionToken) return VIDEH_ICE_SERVERS_FALLBACK;
  try {
    const { getApiUrl } = require("./api") as typeof import("./api");
    const res = await fetch(`${getApiUrl()}/api/webrtc/ice-config`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = (await res.json()) as { success?: boolean; iceServers?: RTCIceServer[] };
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
