import AsyncStorage from "@react-native-async-storage/async-storage";

const prefix = "videh_group_translate_lang_";

export async function readLocalGroupTranslateLang(chatId: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(`${prefix}${chatId}`);
    if (raw === null) return null;
    if (raw === "") return null;
    return raw;
  } catch {
    return null;
  }
}

export async function writeLocalGroupTranslateLang(
  chatId: string,
  lang: string | null,
): Promise<void> {
  try {
    await AsyncStorage.setItem(`${prefix}${chatId}`, lang ?? "");
  } catch {
    /* ignore */
  }
}
