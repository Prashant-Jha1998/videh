import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeJsonParse } from "@/lib/safeJson";

/** Slim persisted row — enough to render chat instantly on cold start. */
export type CachedChatMessage = {
  id: string;
  clientMessageId?: string;
  serverMessageId?: string;
  text: string;
  timestamp: number;
  senderId: string;
  senderName?: string;
  type: string;
  status?: string;
  mediaUrl?: string;
  albumUrls?: string[];
  isViewOnce?: boolean;
  viewOnceOpened?: boolean;
  isEdited?: boolean;
  replyToId?: string;
  replyText?: string;
  replySenderName?: string;
  replyQuotedSenderId?: string;
  replyType?: string;
  reactions?: { emoji: string; userId: string }[];
  translatedText?: string;
  translationSourceLang?: string;
  translationTargetLang?: string;
};

export type ChatMessageCacheStore = Record<string, CachedChatMessage[]>;

const CACHE_VERSION = 5;
const MAX_MESSAGES_PER_CHAT = 200;
const MAX_CACHED_CHATS = 40;

const cacheKey = (userId: number) => `videh_chat_msg_cache_v${CACHE_VERSION}_${userId}`;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist: { userId: number; store: ChatMessageCacheStore } | null = null;

export function slimMessageForCache(m: CachedChatMessage & Record<string, unknown>): CachedChatMessage {
  return {
    id: String(m.id),
    clientMessageId: m.clientMessageId ? String(m.clientMessageId) : undefined,
    serverMessageId: m.serverMessageId ? String(m.serverMessageId) : undefined,
    text: String(m.text ?? ""),
    timestamp: Number(m.timestamp) || Date.now(),
    senderId: String(m.senderId),
    senderName: m.senderName ? String(m.senderName) : undefined,
    type: String(m.type ?? "text"),
    status: m.status ? String(m.status) : undefined,
    mediaUrl: m.mediaUrl ? String(m.mediaUrl) : undefined,
    albumUrls: Array.isArray(m.albumUrls)
      ? m.albumUrls.map((u) => String(u).trim()).filter(Boolean)
      : undefined,
    isViewOnce: m.isViewOnce ? true : undefined,
    viewOnceOpened: m.viewOnceOpened ? true : undefined,
    isEdited: m.isEdited ? true : undefined,
    replyToId: m.replyToId ? String(m.replyToId) : undefined,
    replyText: m.replyText ? String(m.replyText) : undefined,
    replySenderName: m.replySenderName ? String(m.replySenderName) : undefined,
    replyQuotedSenderId: m.replyQuotedSenderId ? String(m.replyQuotedSenderId) : undefined,
    replyType: m.replyType ? String(m.replyType) : undefined,
    reactions: Array.isArray(m.reactions) ? m.reactions : undefined,
    translatedText: m.translatedText ? String(m.translatedText) : undefined,
    translationSourceLang: m.translationSourceLang ? String(m.translationSourceLang) : undefined,
    translationTargetLang: m.translationTargetLang ? String(m.translationTargetLang) : undefined,
  };
}

export async function loadChatMessageCache(userId: number): Promise<ChatMessageCacheStore> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return {};
    const parsed = safeJsonParse<ChatMessageCacheStore>(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function shouldPersistMessage(m: CachedChatMessage & { id?: string; clientMessageId?: string }): boolean {
  if (!m.id) return false;
  if (m.id.startsWith("hint_")) return false;
  return true;
}

export function rememberChatMessagesInStore(
  store: ChatMessageCacheStore,
  chatId: string,
  messages: CachedChatMessage[],
): ChatMessageCacheStore {
  const next = { ...store };
  const cid = String(chatId);
  const existing = (next[cid] ?? []).map((m) => slimMessageForCache(m));
  const byKey = new Map<string, CachedChatMessage>();
  for (const m of existing) {
    byKey.set(m.clientMessageId ?? m.id, m);
  }
  for (const m of messages.filter((row) => shouldPersistMessage(row)).map((row) => slimMessageForCache(row))) {
    byKey.set(m.clientMessageId ?? m.id, m);
  }
  const merged = [...byKey.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_MESSAGES_PER_CHAT);
  next[cid] = merged;

  const keys = Object.keys(next);
  if (keys.length > MAX_CACHED_CHATS) {
    const sorted = keys.sort((a, b) => {
      const aLast = next[a]?.[next[a].length - 1]?.timestamp ?? 0;
      const bLast = next[b]?.[next[b].length - 1]?.timestamp ?? 0;
      return bLast - aLast;
    });
    for (const drop of sorted.slice(MAX_CACHED_CHATS)) {
      delete next[drop];
    }
  }
  return next;
}

/** Append or update one outgoing row and flush immediately (before network). */
export async function persistOutgoingMessageNow(
  userId: number,
  store: ChatMessageCacheStore,
  chatId: string,
  message: CachedChatMessage,
): Promise<ChatMessageCacheStore> {
  const cid = String(chatId);
  const slim = slimMessageForCache(message);
  const existing = (store[cid] ?? []).filter(
    (m) => m.id !== slim.id && m.clientMessageId !== slim.clientMessageId,
  );
  const next = rememberChatMessagesInStore(store, cid, [...existing, slim]);
  pendingPersist = { userId, store: next };
  await flushChatMessageCache();
  return next;
}

export function schedulePersistChatMessageCache(userId: number, store: ChatMessageCacheStore): void {
  pendingPersist = { userId, store };
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void flushChatMessageCache();
  }, 150);
}

/** Write pending cache immediately (call on app background / before kill). */
export async function flushChatMessageCache(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const job = pendingPersist;
  pendingPersist = null;
  if (!job) return;
  try {
    await AsyncStorage.setItem(cacheKey(job.userId), JSON.stringify(job.store));
  } catch {
    /* ignore */
  }
}
