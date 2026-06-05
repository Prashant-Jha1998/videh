import { Platform } from "react-native";
import { getApiUrl } from "@/lib/api";

export type ChatStreamHandler = (eventType: string, data: string) => void;

function parseSseBlocks(buffer: string): { events: Array<{ type: string; data: string }>; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: Array<{ type: string; data: string }> = [];
  for (const block of parts) {
    if (!block.trim()) continue;
    let type = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    const data = dataLines.join("\n");
    if (data && type !== "ping" && type !== "ready") events.push({ type, data });
  }
  return { events, rest };
}

/** SSE for chat events — EventSource on web, XHR stream on React Native (WhatsApp-style instant). */
export function connectChatEventStream(
  userId: number,
  token: string | null,
  onEvent: ChatStreamHandler,
): () => void {
  const base = `${getApiUrl()}/api/chats/user/${userId}/events`;
  const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;

  if (Platform.OS === "web" && typeof globalThis.EventSource !== "undefined") {
    const es = new globalThis.EventSource(url);
    const bind = (type: string) => (ev: MessageEvent) => onEvent(type, String(ev.data ?? ""));
    es.addEventListener("message", bind("message") as EventListener);
    es.addEventListener("typing", bind("typing") as EventListener);
    es.addEventListener("call", bind("call") as EventListener);
    return () => es.close();
  }

  let xhr: XMLHttpRequest | null = null;
  let lastLen = 0;
  let buf = "";
  let cancelled = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    const parsed = parseSseBlocks(buf);
    buf = parsed.rest;
    for (const ev of parsed.events) onEvent(ev.type, ev.data);
  };

  const scheduleReconnect = () => {
    if (cancelled) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, 1500);
  };

  const connect = () => {
    if (cancelled) return;
    xhr?.abort();
    xhr = new XMLHttpRequest();
    lastLen = 0;
    buf = "";
    xhr.open("GET", url);
    xhr.setRequestHeader("Accept", "text/event-stream");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.onprogress = () => {
      if (!xhr) return;
      const text = xhr.responseText;
      const chunk = text.slice(lastLen);
      lastLen = text.length;
      if (!chunk) return;
      buf += chunk;
      flush();
    };
    xhr.onload = scheduleReconnect;
    xhr.onerror = scheduleReconnect;
    xhr.send();
  };

  connect();

  return () => {
    cancelled = true;
    if (retryTimer) clearTimeout(retryTimer);
    xhr?.abort();
    xhr = null;
  };
}
