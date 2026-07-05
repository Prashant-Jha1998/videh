import { EventEmitter } from "node:events";
import type { Response } from "express";
import { logger } from "./logger";
import { initRedisBus, isRedisBusEnabled, publishRedisBus } from "./redisBus";

export type ChatEvent = {
  type: "message" | "read" | "archive" | "typing" | "call" | "group_join_request" | "group_deleted";
  chatId: string | number;
  userIds: Array<string | number>;
  payload?: unknown;
};

const bus = new EventEmitter();
bus.setMaxListeners(0);

/** Active SSE streams per user (multi-tab / reconnect safe). */
const sseConnectionCounts = new Map<number, number>();

let redisBusActive = false;

export function isRedisBusActive(): boolean {
  return redisBusActive;
}

export function isUserSseConnected(userId: number): boolean {
  return (sseConnectionCounts.get(userId) ?? 0) > 0;
}

export function filterSseConnectedUserIds(userIds: number[]): number[] {
  return userIds.filter((id) => Number.isFinite(id) && id > 0 && isUserSseConnected(id));
}

/** Call once before accepting traffic. Enables cross-instance SSE when REDIS_URL is set. */
export async function initRealtimeBus(): Promise<void> {
  if (!isRedisBusEnabled()) {
    logger.info("Realtime bus: single-process mode (set REDIS_URL for horizontal scale)");
    return;
  }
  try {
    await initRedisBus((raw) => {
      try {
        bus.emit("chat", JSON.parse(raw) as ChatEvent);
      } catch (err) {
        logger.warn({ err }, "Ignored malformed chat event from Redis");
      }
    });
    redisBusActive = true;
    logger.info("Realtime bus: Redis connected");
  } catch (err) {
    logger.error({ err }, "Redis bus unavailable — multi-worker SSE/calls will not sync");
    if (process.env["NODE_ENV"] === "production") {
      throw err;
    }
  }
}

export function publishChatEvent(event: ChatEvent): void {
  // Always notify SSE clients on this process immediately (do not rely on Redis loopback).
  bus.emit("chat", event);
  if (redisBusActive) {
    publishRedisBus(JSON.stringify(event));
  }
}

export function attachChatEventStream(userId: number, res: Response): () => void {
  sseConnectionCounts.set(userId, (sseConnectionCounts.get(userId) ?? 0) + 1);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`event: ready\ndata: ${JSON.stringify({ success: true })}\n\n`);

  const onEvent = (event: ChatEvent) => {
    if (!event.userIds.map(Number).includes(userId)) return;
    const payload = event.payload as { messageId?: number | string } | undefined;
    const dedupeKey = event.type === "read"
      ? `${event.type}:${event.chatId}:${(event.payload as { status?: string; recipientUserId?: number })?.status ?? ""}:${(event.payload as { recipientUserId?: number })?.recipientUserId ?? ""}`
      : `${event.type}:${event.chatId}:${payload?.messageId ?? ""}`;
    const seen = (onEvent as { _seen?: Set<string> })._seen ??= new Set<string>();
    if (dedupeKey && seen.has(dedupeKey)) return;
    if (dedupeKey) {
      seen.add(dedupeKey);
      setTimeout(() => seen.delete(dedupeKey), 2500);
    }
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    (res as { flush?: () => void }).flush?.();
  };
  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
    (res as { flush?: () => void }).flush?.();
  }, 25_000);
  bus.on("chat", onEvent);
  return () => {
    clearInterval(heartbeat);
    bus.off("chat", onEvent);
    const next = (sseConnectionCounts.get(userId) ?? 1) - 1;
    if (next <= 0) sseConnectionCounts.delete(userId);
    else sseConnectionCounts.set(userId, next);
  };
}
