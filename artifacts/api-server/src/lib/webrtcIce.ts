export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const STUN_FALLBACK: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function getIceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = [...STUN_FALLBACK];
  const turnUrl = process.env["TURN_URL"]?.trim();
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: process.env["TURN_USERNAME"]?.trim() || undefined,
      credential: process.env["TURN_CREDENTIAL"]?.trim() || undefined,
    });
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
