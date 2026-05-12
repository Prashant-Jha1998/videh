import net from "node:net";
import tls from "node:tls";

type Entry = { value: string; expiresAt: number | null };
const localStore = new Map<string, Entry>();
const REDIS_URL = process.env["REDIS_URL"] || process.env["UPSTASH_REDIS_URL"] || "";

function cleanupLocal(): void {
  const now = Date.now();
  for (const [key, entry] of localStore) {
    if (entry.expiresAt && entry.expiresAt <= now) localStore.delete(key);
  }
}

function encodeCommand(parts: string[]): string {
  return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`;
}

function parseRespReplies(buffer: Buffer): unknown[] {
  const text = buffer.toString("utf8");
  const parseAt = (idx: number): [unknown, number] => {
    const type = text[idx];
    if (type === "+" || type === "-" || type === ":") {
      const end = text.indexOf("\r\n", idx);
      return [text.slice(idx + 1, end), end + 2];
    }
    if (type === "$") {
      const end = text.indexOf("\r\n", idx);
      const len = Number(text.slice(idx + 1, end));
      if (len < 0) return [null, end + 2];
      const start = end + 2;
      return [text.slice(start, start + len), start + len + 2];
    }
    if (type === "*") {
      const end = text.indexOf("\r\n", idx);
      const count = Number(text.slice(idx + 1, end));
      let next = end + 2;
      const arr: unknown[] = [];
      for (let i = 0; i < count; i++) {
        const [value, after] = parseAt(next);
        arr.push(value);
        next = after;
      }
      return [arr, next];
    }
    return [null, text.length];
  };
  const replies: unknown[] = [];
  let idx = 0;
  while (idx < text.length) {
    const [value, next] = parseAt(idx);
    replies.push(value);
    if (next <= idx) break;
    idx = next;
  }
  return replies;
}

async function redisCommand(parts: string[]): Promise<unknown> {
  if (!REDIS_URL) throw new Error("Redis not configured");
  const url = new URL(REDIS_URL);
  const password = url.password ? decodeURIComponent(url.password) : "";
  const commands: string[][] = [];
  if (password) commands.push(["AUTH", password]);
  commands.push(parts);
  return new Promise((resolve, reject) => {
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const socket = url.protocol === "rediss:"
      ? tls.connect({
          host: url.hostname,
          port: Number(url.port || 6380),
          timeout: 4000,
        })
      : net.connect({
          host: url.hostname,
          port: Number(url.port || 6379),
          timeout: 4000,
        });
    let chunks: Buffer[] = [];
    socket.on("connect", () => socket.write(commands.map(encodeCommand).join("")));
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => socket.end(), 20);
    });
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Redis command timed out"));
    });
    socket.on("end", () => {
      const repliesText = Buffer.concat(chunks);
      try {
        const replies = parseRespReplies(repliesText);
        resolve(replies[replies.length - 1] ?? null);
      } catch (err) {
        reject(err);
      }
    });
    socket.on("close", () => {
      if (chunks.length === 0) reject(new Error("Redis connection closed"));
    });
  });
}

export async function stateSetJson(key: string, value: unknown, ttlMs?: number): Promise<void> {
  const raw = JSON.stringify(value);
  if (REDIS_URL) {
    try {
      if (ttlMs) await redisCommand(["SET", key, raw, "PX", String(ttlMs)]);
      else await redisCommand(["SET", key, raw]);
      return;
    } catch {
      // Keep local fallback available during Redis outages.
    }
  }
  localStore.set(key, { value: raw, expiresAt: ttlMs ? Date.now() + ttlMs : null });
}

export async function stateGetJson<T>(key: string): Promise<T | null> {
  if (REDIS_URL) {
    try {
      const value = await redisCommand(["GET", key]);
      return typeof value === "string" ? JSON.parse(value) as T : null;
    } catch {
      // fall through to local fallback
    }
  }
  cleanupLocal();
  const entry = localStore.get(key);
  return entry ? JSON.parse(entry.value) as T : null;
}

export async function stateDelete(key: string): Promise<void> {
  if (REDIS_URL) {
    try {
      await redisCommand(["DEL", key]);
      return;
    } catch {
      // fall through
    }
  }
  localStore.delete(key);
}

export async function stateKeys(prefix: string): Promise<string[]> {
  if (REDIS_URL) {
    try {
      const keys = await redisCommand(["KEYS", `${prefix}*`]);
      if (Array.isArray(keys)) return keys.filter((key): key is string => typeof key === "string");
    } catch {
      // fall through
    }
  }
  cleanupLocal();
  return [...localStore.keys()].filter((key) => key.startsWith(prefix));
}

export async function stateAcquireLock(key: string, ttlMs: number): Promise<boolean> {
  const value = `${process.pid}:${Date.now()}`;
  if (REDIS_URL) {
    try {
      const result = await redisCommand(["SET", key, value, "NX", "PX", String(ttlMs)]);
      return result === "OK";
    } catch {
      // fall through
    }
  }
  cleanupLocal();
  if (localStore.has(key)) return false;
  localStore.set(key, { value, expiresAt: Date.now() + ttlMs });
  return true;
}
