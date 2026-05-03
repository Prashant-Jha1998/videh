import AsyncStorage from "@react-native-async-storage/async-storage";

export const CHAT_STORAGE = {
  theme: "chatThemeChoice",
  wallpaper: "chatWallpaper",
  fontSize: "chatFontSize",
  enterIsSend: "enterIsSend",
  mediaVisibility: "mediaVisibility",
  emojiVariant: "emojiVariant",
  backup: "chatBackupFreq",
} as const;

export type ChatThemeChoice = "system" | "light" | "dark";

const THEME_LABELS = ["System default", "Light", "Dark"] as const;
export function themeLabelToChoice(label: string): ChatThemeChoice {
  if (label === "Light") return "light";
  if (label === "Dark") return "dark";
  return "system";
}

export function choiceToThemeLabel(c: ChatThemeChoice): (typeof THEME_LABELS)[number] {
  if (c === "light") return "Light";
  if (c === "dark") return "Dark";
  return "System default";
}

export async function loadChatThemeChoice(): Promise<ChatThemeChoice> {
  const raw = await AsyncStorage.getItem(CHAT_STORAGE.theme);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export async function saveChatThemeChoice(c: ChatThemeChoice): Promise<void> {
  await AsyncStorage.setItem(CHAT_STORAGE.theme, c);
}

export async function loadEnterIsSend(): Promise<boolean> {
  return (await AsyncStorage.getItem(CHAT_STORAGE.enterIsSend)) === "true";
}

export async function saveEnterIsSend(v: boolean): Promise<void> {
  await AsyncStorage.setItem(CHAT_STORAGE.enterIsSend, v ? "true" : "false");
}

export async function loadOptionalString(key: string, fallback: string): Promise<string> {
  const v = await AsyncStorage.getItem(key);
  return v ?? fallback;
}

export async function saveOptionalString(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

export async function loadOptionalBool(key: string, fallback: boolean): Promise<boolean> {
  const v = await AsyncStorage.getItem(key);
  if (v === null) return fallback;
  return v === "true";
}

export async function saveOptionalBool(key: string, value: boolean): Promise<void> {
  await AsyncStorage.setItem(key, value ? "true" : "false");
}
