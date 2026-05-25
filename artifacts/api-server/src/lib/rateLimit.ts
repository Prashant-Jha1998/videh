const rateMap = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string | null } }): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0]!.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

/** Returns true when the client exceeded the limit (should reject with 429). */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const row = rateMap.get(key);
  if (!row || row.resetAt < now) {
    rateMap.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  row.count += 1;
  return row.count > limit;
}
