import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env["REDIS_URL"] || process.env["UPSTASH_REDIS_URL"] || "";
export const CHAT_EVENTS_CHANNEL = "videh:chat-events";

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

export function isRedisBusEnabled(): boolean {
  return Boolean(REDIS_URL);
}

export async function initRedisBus(onMessage: (payload: string) => void): Promise<void> {
  if (!REDIS_URL) return;

  const options = {
    maxRetriesPerRequest: null as null,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 8000,
    tls: REDIS_URL.startsWith("rediss://") ? {} : undefined,
  };

  publisher = new Redis(REDIS_URL, options);
  subscriber = new Redis(REDIS_URL, options);

  subscriber.on("message", (_channel: string, message: string) => onMessage(message));
  subscriber.on("error", (err: Error) => logger.error({ err }, "Redis subscriber error"));
  publisher.on("error", (err: Error) => logger.error({ err }, "Redis publisher error"));

  await Promise.all([publisher.connect(), subscriber.connect()]);
  await subscriber.subscribe(CHAT_EVENTS_CHANNEL);
  logger.info({ channel: CHAT_EVENTS_CHANNEL }, "Redis chat event bus ready");
}

export function publishRedisBus(payload: string): void {
  if (!publisher) return;
  void publisher.publish(CHAT_EVENTS_CHANNEL, payload).catch((err: unknown) => {
    logger.error({ err }, "Redis publish failed");
  });
}

export async function pingRedisBus(): Promise<boolean> {
  if (!publisher) return false;
  try {
    return (await publisher.ping()) === "PONG";
  } catch {
    return false;
  }
}
