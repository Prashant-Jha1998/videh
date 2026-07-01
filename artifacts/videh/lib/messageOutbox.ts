import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Chat, Message } from "@/context/AppContext";
import { safeJsonParse } from "@/lib/safeJson";
import { isClientMessageUuid } from "@/lib/clientMessageId";

export type OutboxSendStatus = "pending" | "sent" | "failed";

/** Durable send queue entry — survives process kill and app restart. */
export type TextOutboxEntry = {
  clientMessageId: string;
  chatId: string;
  text: string;
  /** Original sender timestamp — never modified. */
  timestamp: number;
  status: OutboxSendStatus;
  replyToId?: string;
  replyText?: string;
  replySenderName?: string;
  replyQuotedSenderId?: string;
  replyType?: string;
  statusReplyId?: string;
  serverMessageId?: string;
  /** @deprecated legacy field — migrated to clientMessageId */
  tempId?: string;
};

const OUTBOX_VERSION = 2;
const outboxKey = (userId: number) => `videh_msg_outbox_v${OUTBOX_VERSION}_${userId}`;
const outboxKeyV1 = (userId: number) => `videh_msg_outbox_v1_${userId}`;

function normalizeOutboxEntry(raw: TextOutboxEntry & { tempId?: string }): TextOutboxEntry {
  const clientMessageId = raw.clientMessageId ?? raw.tempId;
  if (!clientMessageId) {
    throw new Error("Invalid outbox entry");
  }
  return {
    clientMessageId,
    chatId: String(raw.chatId),
    text: raw.text,
    timestamp: raw.timestamp,
    status: raw.status ?? "pending",
    replyToId: raw.replyToId,
    replyText: raw.replyText,
    replySenderName: raw.replySenderName,
    replyQuotedSenderId: raw.replyQuotedSenderId,
    replyType: raw.replyType,
    statusReplyId: raw.statusReplyId,
    serverMessageId: raw.serverMessageId,
  };
}

export async function loadMessageOutbox(userId: number): Promise<TextOutboxEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    if (raw) {
      const parsed = safeJsonParse<TextOutboxEntry[]>(raw, []);
      return Array.isArray(parsed)
        ? parsed.map((e) => normalizeOutboxEntry(e as TextOutboxEntry & { tempId?: string }))
        : [];
    }
    const legacyRaw = await AsyncStorage.getItem(outboxKeyV1(userId));
    if (!legacyRaw) return [];
    const legacy = safeJsonParse<Array<TextOutboxEntry & { tempId: string }>>(legacyRaw, []);
    const migrated = legacy.map((e) => normalizeOutboxEntry({
      ...e,
      clientMessageId: e.tempId,
      status: "pending" as const,
    }));
    if (migrated.length) {
      await saveMessageOutbox(userId, migrated);
      await AsyncStorage.removeItem(outboxKeyV1(userId));
    }
    return migrated;
  } catch {
    return [];
  }
}

export async function saveMessageOutbox(userId: number, entries: TextOutboxEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

/** Persist to disk before any network request (WhatsApp-style). */
export async function addTextToMessageOutbox(userId: number, entry: TextOutboxEntry): Promise<void> {
  const existing = await loadMessageOutbox(userId);
  const normalized = normalizeOutboxEntry(entry);
  const next = [
    ...existing.filter((e) => e.clientMessageId !== normalized.clientMessageId),
    normalized,
  ];
  await saveMessageOutbox(userId, next);
}

export async function updateTextOutboxEntry(
  userId: number,
  clientMessageId: string,
  patch: Partial<TextOutboxEntry>,
): Promise<void> {
  const existing = await loadMessageOutbox(userId);
  const idx = existing.findIndex((e) => e.clientMessageId === clientMessageId);
  if (idx < 0) return;
  existing[idx] = { ...existing[idx]!, ...patch, clientMessageId };
  await saveMessageOutbox(userId, existing);
}

export async function removeFromMessageOutbox(userId: number, clientMessageId: string): Promise<void> {
  const existing = await loadMessageOutbox(userId);
  if (!existing.some((e) => e.clientMessageId === clientMessageId)) return;
  await saveMessageOutbox(userId, existing.filter((e) => e.clientMessageId !== clientMessageId));
}

export function outboxEntryToMessage(entry: TextOutboxEntry, uploadFailed = false): Message {
  const status: Message["status"] =
    entry.status === "sent"
      ? "sent"
      : uploadFailed || entry.status === "failed"
        ? "sent"
        : "pending";
  return {
    id: entry.clientMessageId,
    clientMessageId: entry.clientMessageId,
    serverMessageId: entry.serverMessageId,
    text: entry.text,
    timestamp: entry.timestamp,
    senderId: "me",
    type: "text",
    status,
    replyToId: entry.replyToId,
    replyText: entry.replyText,
    replySenderName: entry.replySenderName,
    replyQuotedSenderId: entry.replyQuotedSenderId,
    replyType: entry.replyType,
    uploadFailed: uploadFailed || entry.status === "failed",
  };
}

function mergeOutboxIntoOneChat(chat: Chat, pending: TextOutboxEntry[]): Chat {
  const byClientId = new Map(chat.messages.map((m) => [m.clientMessageId ?? m.id, m]));
  for (const entry of pending) {
    const existing = byClientId.get(entry.clientMessageId);
    if (existing) {
      byClientId.set(entry.clientMessageId, {
        ...existing,
        ...outboxEntryToMessage(entry, existing.uploadFailed),
        timestamp: entry.timestamp,
      });
    } else {
      byClientId.set(entry.clientMessageId, outboxEntryToMessage(entry));
    }
  }
  const messages = [...byClientId.values()].sort((a, b) => a.timestamp - b.timestamp);
  const last = messages[messages.length - 1];
  return {
    ...chat,
    messages,
    lastMessage: last
      ? (last.text.length > 120 ? `${last.text.slice(0, 117).trimEnd()}…` : last.text)
      : chat.lastMessage,
    lastMessageTime: last ? Math.max(chat.lastMessageTime ?? 0, last.timestamp) : chat.lastMessageTime,
  };
}

/** Re-inject unsent rows after cold start — creates chat stubs when needed. */
export function mergeOutboxIntoChats(chats: Chat[], outbox: TextOutboxEntry[]): Chat[] {
  if (!outbox.length) return chats;
  const pendingOnly = outbox.filter((e) => e.status === "pending" || e.status === "failed");
  if (!pendingOnly.length) return chats;

  const byChat = new Map<string, TextOutboxEntry[]>();
  for (const entry of pendingOnly) {
    const cid = String(entry.chatId);
    const list = byChat.get(cid) ?? [];
    list.push(entry);
    byChat.set(cid, list);
  }

  const merged = chats.map((chat) => {
    const pending = byChat.get(String(chat.id));
    if (!pending?.length) return chat;
    byChat.delete(String(chat.id));
    return mergeOutboxIntoOneChat(chat, pending);
  });

  for (const [chatId, pending] of byChat) {
    merged.push({
      id: chatId,
      name: "Chat",
      messages: pending.map((e) => outboxEntryToMessage(e)).sort((a, b) => a.timestamp - b.timestamp),
      unreadCount: 0,
      isGroup: false,
      lastMessage: pending[pending.length - 1]?.text,
      lastMessageTime: pending[pending.length - 1]?.timestamp,
    });
  }

  return merged;
}

export function outboxNeedsRetry(entry: TextOutboxEntry): boolean {
  return entry.status === "pending" || entry.status === "failed";
}

export function isOutboxClientId(id: string): boolean {
  return isClientMessageUuid(id) || id.startsWith("tmp_");
}
