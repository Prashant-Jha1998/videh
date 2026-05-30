import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { AppIconStyleId } from "@/lib/themeAppearance";

const APP_ICON_KEY = "videh_app_icon_style_v1";

export async function loadAppIconStyle(): Promise<AppIconStyleId> {
  const raw = await AsyncStorage.getItem(APP_ICON_KEY);
  if (
    raw === "green"
    || raw === "black"
    || raw === "gold"
    || raw === "blue"
    || raw === "purple"
    || raw === "default"
  ) {
    return raw;
  }
  return "default";
}

export async function saveAppIconStyle(id: AppIconStyleId): Promise<void> {
  await AsyncStorage.setItem(APP_ICON_KEY, id);
}

/** Alternate home-screen icons need a native build with icon assets; preference is stored now. */
export function appIconChangeSupported(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}
