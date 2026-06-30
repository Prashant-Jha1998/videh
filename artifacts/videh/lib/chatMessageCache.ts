import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeJsonParse } from "@/lib/safeJson";

/** Slim persisted row — enough to render chat instantly on cold start. */
export type CachedChatMessage = {
  id: string;
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
};

export type ChatMessageCacheStore = Record<string, CachedChatMessage[]>;

const CACHE_VERSION = 3;
const MAX_MESSAGES_PER_CHAT = 80;
const MAX_CACHED_CHATS = 40;

const cacheKey = (userId: number) => `videh_chat_msg_cache_v${CACHE_VERSION}_${userId}`;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist: { userId: number; store: ChatMessageCacheStore } | null = null;

export function slimMessageForCache(m: CachedChatMessage & Record<string, unknown>): CachedChatMessage {
  return {
    id: String(m.id),
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

export function rememberChatMessagesInStore(
  store: ChatMessageCacheStore,
  chatId: string,
  messages: CachedChatMessage[],
): ChatMessageCacheStore {
  const next = { ...store };
  const slim = messages
    .filter((m) => m.id && !m.id.startsWith("tmp_") && !m.id.startsWith("hint_"))
    .map((m) => slimMessageForCache(m))
    .slice(-MAX_MESSAGES_PER_CHAT);
  next[String(chatId)] = slim;

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
