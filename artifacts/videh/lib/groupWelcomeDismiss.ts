import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "videh_group_welcome_dismissed";

export async function isGroupWelcomeDismissed(chatId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return Boolean(map[chatId]);
  } catch {
    return false;
  }
}

export async function dismissGroupWelcome(chatId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[chatId] = true;
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
