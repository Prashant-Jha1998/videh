import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeJsonParse } from "@/lib/safeJson";

export type ChatScrollSnapshot = {
  readingHistory: boolean;
  scrollOffset: number;
};

const key = (userId: number, chatId: string) => `videh_chat_scroll_${userId}_${chatId}`;

export async function loadChatScrollSnapshot(
  userId: number | undefined,
  chatId: string,
): Promise<ChatScrollSnapshot | null> {
  if (!userId || !chatId) return null;
  try {
    const raw = await AsyncStorage.getItem(key(userId, chatId));
    if (!raw) return null;
    const parsed = safeJsonParse<ChatScrollSnapshot | null>(raw, null);
    if (!parsed || typeof parsed.readingHistory !== "boolean") return null;
    return {
      readingHistory: parsed.readingHistory,
      scrollOffset: Number(parsed.scrollOffset) || 0,
    };
  } catch {
    return null;
  }
}

export async function saveChatScrollSnapshot(
  userId: number | undefined,
  chatId: string,
  snapshot: ChatScrollSnapshot,
): Promise<void> {
  if (!userId || !chatId) return;
  try {
    await AsyncStorage.setItem(key(userId, chatId), JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}
