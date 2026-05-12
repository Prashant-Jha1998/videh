import { EventEmitter } from "node:events";
import type { Response } from "express";

type ChatEvent = {
  type: "message" | "read" | "archive" | "typing";
  chatId: string | number;
  userIds: Array<string | number>;
  payload?: unknown;
};

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishChatEvent(event: ChatEvent): void {
  bus.emit("chat", event);
}

export function attachChatEventStream(userId: number, res: Response): () => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
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
