import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Chat, Message } from "@/context/AppContext";
import { safeJsonParse } from "@/lib/safeJson";

/** Pending text message saved before server ACK (WhatsApp-style outbox). */
export type TextOutboxEntry = {
  tempId: string;
  chatId: string;
  text: string;
  timestamp: number;
  replyToId?: string;
  replyText?: string;
  replySenderName?: string;
  replyQuotedSenderId?: string;
  replyType?: string;
  statusReplyId?: string;
};

const OUTBOX_VERSION = 1;
const outboxKey = (userId: number) => `videh_msg_outbox_v${OUTBOX_VERSION}_${userId}`;

export async function loadMessageOutbox(userId: number): Promise<TextOutboxEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    if (!raw) return [];
    const parsed = safeJsonParse<TextOutboxEntry[]>(raw, []);
    return Array.isArray(parsed) ? parsed : [];
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

export async function addTextToMessageOutbox(userId: number, entry: TextOutboxEntry): Promise<void> {
  const existing = await loadMessageOutbox(userId);
  const next = [...existing.filter((e) => e.tempId !== entry.tempId), entry];
  await saveMessageOutbox(userId, next);
}

export async function removeFromMessageOutbox(userId: number, tempId: string): Promise<void> {
  const existing = await loadMessageOutbox(userId);
  if (!existing.some((e) => e.tempId === tempId)) return;
  await saveMessageOutbox(userId, existing.filter((e) => e.tempId !== tempId));
}

export function outboxEntryToMessage(entry: TextOutboxEntry, uploadFailed = false): Message {
  return {
    id: entry.tempId,
    text: entry.text,
    timestamp: entry.timestamp,
    senderId: "me",
    type: "text",
    status: "sent",
    replyToId: entry.replyToId,
    replyText: entry.replyText,
    replySenderName: entry.replySenderName,
    replyQuotedSenderId: entry.replyQuotedSenderId,
    replyType: entry.replyType,
    uploadFailed,
  };
}

/** Re-inject unsent rows after cold start so the sender still sees their message. */
export function mergeOutboxIntoChats(chats: Chat[], outbox: TextOutboxEntry[]): Chat[] {
  if (!outbox.length) return chats;
  const byChat = new Map<string, TextOutboxEntry[]>();
  for (const entry of outbox) {
    const cid = String(entry.chatId);
    const list = byChat.get(cid) ?? [];
    list.push(entry);
    byChat.set(cid, list);
  }

  return chats.map((chat) => {
    const pending = byChat.get(String(chat.id));
    if (!pending?.length) return chat;
    const existingIds = new Set(chat.messages.map((m) => m.id));
    const toAdd = pending
      .filter((e) => !existingIds.has(e.tempId))
      .map((e) => outboxEntryToMessage(e));
    if (!toAdd.length) return chat;
    const messages = [...chat.messages, ...toAdd].sort((a, b) => a.timestamp - b.timestamp);
    const last = messages[messages.length - 1]!;
    return {
      ...chat,
      messages,
      lastMessage: last.text.length > 120 ? `${last.text.slice(0, 117).trimEnd()}…` : last.text,
      lastMessageTime: Math.max(chat.lastMessageTime ?? 0, last.timestamp),
    };
  });
}
