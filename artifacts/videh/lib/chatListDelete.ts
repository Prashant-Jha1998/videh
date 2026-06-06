import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeJsonParse } from "@/lib/safeJson";

export const HIDDEN_CHATS_KEY = "videh_hidden_chat_ids";
export const CHAT_DELETED_AT_KEY = "videh_chat_deleted_at";

export type ChatDeletedAtMap = Record<string, number>;

export async function loadHiddenChatIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_CHATS_KEY);
    return safeJsonParse<string[]>(raw, []) ?? [];
  } catch {
    return [];
  }
}

export async function saveHiddenChatIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(HIDDEN_CHATS_KEY, JSON.stringify(ids));
}

export async function loadChatDeletedAtMap(): Promise<ChatDeletedAtMap> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_DELETED_AT_KEY);
    const parsed = safeJsonParse<ChatDeletedAtMap>(raw, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveChatDeletedAtMap(map: ChatDeletedAtMap): Promise<void> {
  await AsyncStorage.setItem(CHAT_DELETED_AT_KEY, JSON.stringify(map));
}

export function chatClearCutoff(
  chatId: string,
  globalClearedAt: number,
  deletedMap: ChatDeletedAtMap,
): number {
  return Math.max(globalClearedAt, deletedMap[String(chatId)] ?? 0);
}

/** WhatsApp-style: chat reappears when a new message is sent or received after delete. */
export function shouldRestoreDeletedChat(
  chatId: string,
  hiddenIds: string[],
  deletedMap: ChatDeletedAtMap,
  lastMessageTime?: number,
): boolean {
  if (!hiddenIds.includes(chatId)) return false;
  const deletedAt = deletedMap[chatId] ?? 0;
  if (!deletedAt) return false;
  return (lastMessageTime ?? 0) > deletedAt;
}
