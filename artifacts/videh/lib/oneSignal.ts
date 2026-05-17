import Constants from "expo-constants";
import { Platform } from "react-native";

let initialized = false;

export function getOneSignalAppId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { oneSignalAppId?: string } | undefined;
  return extra?.oneSignalAppId?.trim()
    || process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID?.trim()
    || undefined;
}

/** OneSignal free push — no Firebase. Call once at app start. */
export function initOneSignal(): void {
  if (initialized || Platform.OS === "web") return;
  const appId = getOneSignalAppId();
  if (!appId) return;

  try {
    const { OneSignal } = require("react-native-onesignal");
    OneSignal.initialize(appId);
    OneSignal.Notifications.requestPermission(true);
    initialized = true;
  } catch {
    // native module missing in Expo Go
  }
}

export function oneSignalLogin(userId: number): void {
  if (Platform.OS === "web" || !userId) return;
  try {
    const { OneSignal } = require("react-native-onesignal");
    OneSignal.login(String(userId));
  } catch {}
}

export function oneSignalLogout(): void {
  if (Platform.OS === "web") return;
  try {
    const { OneSignal } = require("react-native-onesignal");
    OneSignal.logout();
  } catch {}
}
