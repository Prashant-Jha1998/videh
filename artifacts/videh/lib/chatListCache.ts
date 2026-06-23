import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeJsonParse } from "@/lib/safeJson";

const CACHE_VERSION = 1;
const cacheKey = (userId: number) => `videh_chat_list_v${CACHE_VERSION}_${userId}`;

export type CachedChatListRow = {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  isGroup: boolean;
  isOnline?: boolean;
  members?: string[];
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  otherUserId?: number;
  isKhataNotebook?: boolean;
  disappearAfterSeconds?: number | null;
};

export async function loadChatListCache(userId: number): Promise<CachedChatListRow[]> {
  const raw = await AsyncStorage.getItem(cacheKey(userId));
  const parsed = safeJsonParse<CachedChatListRow[] | null>(raw, null);
  return Array.isArray(parsed) ? parsed : [];
}

export function chatListRowToCached(chat: CachedChatListRow & { messages?: unknown[] }): CachedChatListRow {
  const { messages: _messages, ...rest } = chat;
  return rest;
}

export function cachedRowToChat(row: CachedChatListRow): CachedChatListRow & { messages: [] } {
  return { ...row, messages: [] };
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePersistChatListCache(
  userId: number,
  chats: Array<CachedChatListRow & { messages?: unknown[] }>,
): void {
  const slim = chats.map(chatListRowToCached);
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void AsyncStorage.setItem(cacheKey(userId), JSON.stringify(slim)).catch(() => {});
  }, 400);
}
