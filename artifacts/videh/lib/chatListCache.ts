import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Chat, Message } from "@/context/AppContext";
import { safeJsonParse } from "@/lib/safeJson";
import type { CachedChatMessage, ChatMessageCacheStore } from "@/lib/chatMessageCache";

/** Chat list row persisted for instant cold start (standard). */
export type CachedChatListRow = {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  isGroup: boolean;
  isOnline?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  otherUserId?: number;
  disappearAfterSeconds?: number | null;
  autoTranslateEnabled?: boolean;
};

const CACHE_VERSION = 1;
const MAX_CACHED_CHATS = 80;

const cacheKey = (userId: number) => `videh_chat_list_v${CACHE_VERSION}_${userId}`;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist: { userId: number; rows: CachedChatListRow[] } | null = null;

export function slimChatForListCache(chat: Chat): CachedChatListRow {
  return {
    id: String(chat.id),
    name: chat.name,
    avatar: chat.avatar,
    lastMessage: chat.lastMessage,
    lastMessageTime: chat.lastMessageTime,
    unreadCount: chat.unreadCount ?? 0,
    isGroup: Boolean(chat.isGroup),
    isOnline: chat.isOnline,
    isPinned: chat.isPinned,
    isMuted: chat.isMuted,
    isArchived: chat.isArchived,
    otherUserId: chat.otherUserId,
    disappearAfterSeconds: chat.disappearAfterSeconds,
    autoTranslateEnabled: chat.autoTranslateEnabled,
  };
}

function cachedMessageToMessage(m: CachedChatMessage): Message {
  return {
    id: m.id,
    clientMessageId: m.clientMessageId ?? m.id,
    serverMessageId: m.serverMessageId,
    text: m.text,
    timestamp: m.timestamp,
    senderId: m.senderId,
    senderName: m.senderName,
    type: m.type as Message["type"],
    status: (m.status as Message["status"]) ?? (m.serverMessageId ? "sent" : "pending"),
    mediaUrl: m.mediaUrl,
    albumUrls: m.albumUrls,
    isViewOnce: m.isViewOnce,
    viewOnceOpened: m.viewOnceOpened,
    isEdited: m.isEdited,
    replyToId: m.replyToId,
    replyText: m.replyText,
    replySenderName: m.replySenderName,
    replyQuotedSenderId: m.replyQuotedSenderId,
    replyType: m.replyType,
    reactions: m.reactions?.map((r) => ({ emoji: r.emoji, userId: Number(r.userId) })),
    translatedText: m.translatedText,
    translationSourceLang: m.translationSourceLang,
    translationTargetLang: m.translationTargetLang,
  };
}

export function buildChatsFromCache(
  rows: CachedChatListRow[],
  messageStore: ChatMessageCacheStore,
): Chat[] {
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar,
      lastMessage: row.lastMessage,
      lastMessageTime: row.lastMessageTime,
      unreadCount: row.unreadCount,
      isGroup: row.isGroup,
      isOnline: false, // never trust cached presence; refreshed from server
      isPinned: row.isPinned,
      isMuted: row.isMuted,
      isArchived: row.isArchived,
      otherUserId: row.otherUserId,
      disappearAfterSeconds: row.disappearAfterSeconds,
      autoTranslateEnabled: row.autoTranslateEnabled,
      messages: (messageStore[row.id] ?? []).map(cachedMessageToMessage),
    }))
    .sort((a, b) => (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0));
}

export async function loadChatListCache(userId: number): Promise<CachedChatListRow[]> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return [];
    const parsed = safeJsonParse<CachedChatListRow[]>(raw, []);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_CACHED_CHATS) : [];
  } catch {
    return [];
  }
}

export function schedulePersistChatListCache(userId: number, chats: Chat[]): void {
  const rows = chats
    .filter((c) => Boolean(c.lastMessageTime) || Boolean(c.lastMessage) || c.isGroup)
    .map(slimChatForListCache)
    .slice(0, MAX_CACHED_CHATS);
  pendingPersist = { userId, rows };
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void flushChatListCache();
  }, 200);
}

export async function flushChatListCache(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const job = pendingPersist;
  pendingPersist = null;
  if (!job) return;
  try {
    await AsyncStorage.setItem(cacheKey(job.userId), JSON.stringify(job.rows));
  } catch {
    /* ignore */
  }
}
