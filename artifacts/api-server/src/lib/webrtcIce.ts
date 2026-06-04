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

/** STUN-only by default (pre-TURN). Set ENABLE_TURN=1 + TURN_* on server to opt in. */
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

  const enableTurn = process.env["ENABLE_TURN"] === "1" || process.env["ENABLE_TURN"] === "true";
  if (!enableTurn) return STUN_FALLBACK;

  const turnUrl = process.env["TURN_URL"]?.trim();
  if (!turnUrl) return STUN_FALLBACK;

  return [
    ...STUN_FALLBACK,
    {
      urls: turnUrl,
      username: process.env["TURN_USERNAME"]?.trim() || undefined,
      credential: process.env["TURN_CREDENTIAL"]?.trim() || undefined,
    },
  ];
}
