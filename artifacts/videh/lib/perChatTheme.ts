import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AnimatedWallpaperId } from "@/lib/themeAppearance";

const PER_CHAT_THEMES_KEY = "videh_per_chat_themes_v1";

export type PerChatThemeOverride = {
  themeId?: string;
  /** Preset id from CHAT_BUBBLE_PRESETS (preferred for correct light + dark bubbles). */
  bubblePresetId?: string;
  bubbleSent?: string;
  bubbleReceived?: string;
  bubbleSentDark?: string;
  bubbleReceivedDark?: string;
  wallpaperUri?: string | null;
  animatedWallpaper?: AnimatedWallpaperId;
  label?: string;
};

type Store = Record<string, PerChatThemeOverride>;

export async function loadAllPerChatThemes(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(PER_CHAT_THEMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveAllPerChatThemes(store: Store): Promise<void> {
  await AsyncStorage.setItem(PER_CHAT_THEMES_KEY, JSON.stringify(store));
}

export async function getPerChatTheme(chatId: string): Promise<PerChatThemeOverride | null> {
  const all = await loadAllPerChatThemes();
  return all[String(chatId)] ?? null;
}

export async function setPerChatTheme(chatId: string, override: PerChatThemeOverride | null): Promise<void> {
  const all = await loadAllPerChatThemes();
  const key = String(chatId);
  if (!override || Object.keys(override).length === 0) {
    delete all[key];
  } else {
    all[key] = override;
  }
  await saveAllPerChatThemes(all);
}
