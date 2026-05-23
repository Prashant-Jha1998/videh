import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "videh_chat_media_settings_v1";

export type ChatMediaSettings = {
  autoDownloadImages: boolean;
  autoDownloadVideos: boolean;
  autoDownloadDocs: boolean;
};

const DEFAULTS: ChatMediaSettings = {
  autoDownloadImages: true,
  autoDownloadVideos: false,
  autoDownloadDocs: true,
};

export async function loadChatMediaSettings(): Promise<ChatMediaSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ChatMediaSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveChatMediaSettings(settings: ChatMediaSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
