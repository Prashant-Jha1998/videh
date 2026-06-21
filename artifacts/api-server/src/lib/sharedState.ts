import Redis from "ioredis";
import { logger } from "./logger";

type Entry = { value: string; expiresAt: number | null };
const localStore = new Map<string, Entry>();
const REDIS_URL = process.env["REDIS_URL"] || process.env["UPSTASH_REDIS_URL"] || "";

let redisClient: Redis | null = null;
let redisInitFailed = false;

function cleanupLocal(): void {
  const now = Date.now();
  for (const [key, entry] of localStore) {
    if (entry.expiresAt && entry.expiresAt <= now) localStore.delete(key);
  }
}

function getRedis(): Redis | null {
  if (!REDIS_URL || redisInitFailed) return null;
  if (redisClient) return redisClient;
  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 8000,
      tls: REDIS_URL.startsWith("rediss://") ? {} : undefined,
    });
    redisClient.on("error", (err: Error) => {
      logger.error({ err }, "sharedState Redis error");
    });
    return redisClient;
  } catch (err) {
    redisInitFailed = true;
    logger.error({ err }, "sharedState Redis init failed");
    return null;
  }
}

async function withRedis<T>(fn: (redis: Redis) => Promise<T>): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    if (redis.status === "wait") await redis.connect();
    return await fn(redis);
  } catch (err) {
    logger.error({ err }, "sharedState Redis command failed");
    if (REDIS_URL) throw err;
    return null;
  }
}

export async function stateSetJson(key: string, value: unknown, ttlMs?: number): Promise<void> {
  const raw = JSON.stringify(value);
  if (REDIS_URL) {
    await withRedis(async (redis) => {
      if (ttlMs) await redis.set(key, raw, "PX", ttlMs);
      else await redis.set(key, raw);
    });
    return;
  }
  localStore.set(key, { value: raw, expiresAt: ttlMs ? Date.now() + ttlMs : null });
}

export async function stateGetJson<T>(key: string): Promise<T | null> {
  if (REDIS_URL) {
    const value = await withRedis(async (redis) => redis.get(key));
    return typeof value === "string" ? JSON.parse(value) as T : null;
  }
  cleanupLocal();
  const entry = localStore.get(key);
  return entry ? JSON.parse(entry.value) as T : null;
}

export async function stateDelete(key: string): Promise<void> {
  if (REDIS_URL) {
    await withRedis(async (redis) => {
      await redis.del(key);
    });
    return;
  }
  localStore.delete(key);
}

export async function stateKeys(prefix: string): Promise<string[]> {
  if (REDIS_URL) {
    const keys = await withRedis(async (redis) => {
      const found: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
        cursor = next;
        found.push(...batch);
      } while (cursor !== "0");
      return found;
    });
    return keys ?? [];
  }
  cleanupLocal();
  return [...localStore.keys()].filter((key) => key.startsWith(prefix));
}

export async function stateAcquireLock(key: string, ttlMs: number): Promise<boolean> {
  const value = `${process.pid}:${Date.now()}`;
  if (REDIS_URL) {
    const result = await withRedis(async (redis) => redis.set(key, value, "PX", ttlMs, "NX"));
    return result === "OK";
  }
  cleanupLocal();
  if (localStore.has(key)) return false;
  localStore.set(key, { value, expiresAt: Date.now() + ttlMs });
  return true;
}
