import { EventEmitter } from "node:events";
import type { Response } from "express";
import { logger } from "./logger";
import { initRedisBus, isRedisBusEnabled, publishRedisBus } from "./redisBus";

export type ChatEvent = {
  type: "message" | "read" | "archive" | "typing" | "call";
  chatId: string | number;
  userIds: Array<string | number>;
  payload?: unknown;
};

const bus = new EventEmitter();
bus.setMaxListeners(0);

let redisBusActive = false;

/** Call once before accepting traffic. Enables cross-instance SSE when REDIS_URL is set. */
export async function initRealtimeBus(): Promise<void> {
  if (!isRedisBusEnabled()) {
    logger.info("Realtime bus: single-process mode (set REDIS_URL for horizontal scale)");
    return;
  }
  await initRedisBus((raw) => {
    try {
      bus.emit("chat", JSON.parse(raw) as ChatEvent);
    } catch (err) {
      logger.warn({ err }, "Ignored malformed chat event from Redis");
    }
  });
  redisBusActive = true;
}

export function publishChatEvent(event: ChatEvent): void {
  if (redisBusActive) {
    publishRedisBus(JSON.stringify(event));
    return;
  }
  bus.emit("chat", event);
}

export function attachChatEventStream(userId: number, res: Response): () => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ success: true })}\n\n`);

  const onEvent = (event: ChatEvent) => {
    if (!event.userIds.map(Number).includes(userId)) return;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };
  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 25_000);
  bus.on("chat", onEvent);
  return () => {
    clearInterval(heartbeat);
    bus.off("chat", onEvent);
  };
}
