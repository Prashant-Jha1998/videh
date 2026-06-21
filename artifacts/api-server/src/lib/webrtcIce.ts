export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const STUN_FALLBACK: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Public TURN relay when TURN_URL is not configured — needed for many mobile NATs. */
const TURN_FALLBACK: IceServerConfig[] = [
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

/** STUN-only by default (no TURN). Set TURN_URL or VIDEOH_DOMAIN for self-hosted coturn. */
export function getIceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = [...STUN_FALLBACK];
  let turnUrl = process.env["TURN_URL"]?.trim();
  if (!turnUrl) {
    const host = process.env["VIDEOH_DOMAIN"]?.trim() || process.env["EXPO_PUBLIC_DOMAIN"]?.trim();
    if (host) {
      const bare = host.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
      turnUrl = `turn:${bare}:3478`;
    }
  }
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env["TURN_USERNAME"]?.trim() || undefined,
      credential: process.env["TURN_CREDENTIAL"]?.trim() || undefined,
    });
  } else if (process.env["VIDEOH_USE_PUBLIC_TURN"] !== "0") {
    servers.push(...TURN_FALLBACK);
  }
  const extra = process.env["ICE_SERVERS_JSON"]?.trim();
  if (extra) {
    try {
      const parsed = JSON.parse(extra) as IceServerConfig[];
      if (Array.isArray(parsed)) return [...STUN_FALLBACK, ...parsed];
    } catch {
      /* ignore malformed ICE_SERVERS_JSON */
    }
  }
  return servers;
}
