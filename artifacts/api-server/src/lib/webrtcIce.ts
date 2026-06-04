export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const STUN_FALLBACK: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

/** Metered openrelay needs UDP 80, UDP/TCP 443, and TLS — port 80 alone often fails on mobile. */
const METERED_OPENRELAY_URLS = [
  "turn:openrelay.metered.ca:80",
  "turn:openrelay.metered.ca:443",
  "turns:openrelay.metered.ca:443?transport=tcp",
];

function parseTurnUrls(): string[] {
  const fromList = process.env["TURN_URLS"]?.trim();
  if (fromList) {
    return fromList.split(/[,\s]+/).map((u) => u.trim()).filter(Boolean);
  }
  const single = process.env["TURN_URL"]?.trim();
  if (!single) return [];
  if (single.includes("openrelay.metered.ca")) {
    const has443 = single.includes(":443") || single.startsWith("turns:");
    return has443 ? [single, ...METERED_OPENRELAY_URLS.filter((u) => u !== single)] : [...METERED_OPENRELAY_URLS];
  }
  return [single];
}

export function getIceServers(): IceServerConfig[] {
  const extra = process.env["ICE_SERVERS_JSON"]?.trim();
  if (extra) {
    try {
      const parsed = JSON.parse(extra) as IceServerConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) return [...STUN_FALLBACK, ...parsed];
    } catch {
      /* ignore malformed ICE_SERVERS_JSON */
    }
  }

  const servers: IceServerConfig[] = [...STUN_FALLBACK];
  const turnUrls = parseTurnUrls();
  if (turnUrls.length > 0) {
    servers.push({
      urls: turnUrls.length === 1 ? turnUrls[0]! : turnUrls,
      username: process.env["TURN_USERNAME"]?.trim() || undefined,
      credential: process.env["TURN_CREDENTIAL"]?.trim() || undefined,
    });
  }
  return servers;
}
