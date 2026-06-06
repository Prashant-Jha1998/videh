import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeJsonParse } from "@/lib/safeJson";

/** Legacy keys (pre per-user scoping). */
export const HIDDEN_CHATS_KEY = "videh_hidden_chat_ids";
export const CHAT_DELETED_AT_KEY = "videh_chat_deleted_at";

export type ChatDeletedAtMap = Record<string, number>;

export function hiddenChatsKeyForUser(userId: number): string {
  return `videh_hidden_chat_ids_${userId}`;
}

export function chatDeletedAtKeyForUser(userId: number): string {
  return `videh_chat_deleted_at_${userId}`;
}

async function migrateLegacyHiddenIds(userId: number): Promise<string[]> {
  const legacy = await AsyncStorage.getItem(HIDDEN_CHATS_KEY);
  const ids = safeJsonParse<string[]>(legacy, []) ?? [];
  if (ids.length > 0) {
    await AsyncStorage.setItem(hiddenChatsKeyForUser(userId), JSON.stringify(ids));
  }
  return ids;
}

async function migrateLegacyDeletedMap(userId: number): Promise<ChatDeletedAtMap> {
  const legacy = await AsyncStorage.getItem(CHAT_DELETED_AT_KEY);
  const parsed = safeJsonParse<ChatDeletedAtMap>(legacy, {});
  const map = parsed && typeof parsed === "object" ? parsed : {};
  if (Object.keys(map).length > 0) {
    await AsyncStorage.setItem(chatDeletedAtKeyForUser(userId), JSON.stringify(map));
  }
  return map;
}

export async function loadHiddenChatIds(userId: number): Promise<string[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(hiddenChatsKeyForUser(userId));
    if (raw != null) return safeJsonParse<string[]>(raw, []) ?? [];
    return migrateLegacyHiddenIds(userId);
  } catch {
    return [];
  }
}

export async function saveHiddenChatIds(userId: number, ids: string[]): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(hiddenChatsKeyForUser(userId), JSON.stringify(ids));
}

export async function loadChatDeletedAtMap(userId: number): Promise<ChatDeletedAtMap> {
  if (!userId) return {};
  try {
    const raw = await AsyncStorage.getItem(chatDeletedAtKeyForUser(userId));
    if (raw != null) {
      const parsed = safeJsonParse<ChatDeletedAtMap>(raw, {});
      return parsed && typeof parsed === "object" ? parsed : {};
    }
    return migrateLegacyDeletedMap(userId);
  } catch {
    return {};
  }
}

export async function saveChatDeletedAtMap(userId: number, map: ChatDeletedAtMap): Promise<void> {
  if (!userId) return;
  await AsyncStorage.setItem(chatDeletedAtKeyForUser(userId), JSON.stringify(map));
}

export function chatClearCutoff(
  chatId: string,
  globalClearedAt: number,
  deletedMap: ChatDeletedAtMap,
): number {
  return Math.max(globalClearedAt, deletedMap[String(chatId)] ?? 0);
}

/** WhatsApp-style: chat reappears only when a message arrives after delete (not on delete itself). */
export function shouldRestoreDeletedChat(
  chatId: string,
  hiddenIds: string[],
  deletedMap: ChatDeletedAtMap,
  lastMessageTime?: number,
): boolean {
  if (!hiddenIds.includes(chatId)) return false;
  const deletedAt = deletedMap[chatId] ?? 0;
  if (!deletedAt) return false;
  if (lastMessageTime == null || !Number.isFinite(lastMessageTime) || lastMessageTime <= 0) {
    return false;
  }
  return lastMessageTime > deletedAt;
}
