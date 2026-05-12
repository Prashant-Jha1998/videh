import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/api";
import { safeJsonParse } from "@/lib/safeJson";

/** Same id as `artifacts/api-server/src/lib/expoPush.ts` `EXPO_ANDROID_CHANNEL_ID`. */
export const VIDEH_PUSH_CHANNEL_ID = "messages";

export async function ensureVidehAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(VIDEH_PUSH_CHANNEL_ID, {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: "default",
  });
}

function getExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Registers or refreshes the Expo push token on the server (native only). */
export async function registerExpoPushTokenWithServer(dbId: number): Promise<void> {
  if (Platform.OS === "web" || !dbId) return;
  await ensureVidehAndroidNotificationChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;
  const projectId = getExpoProjectId();
  const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
  const base = getApiUrl();
  const stored = await AsyncStorage.getItem("videh_user");
  const sessionToken = safeJsonParse<{ sessionToken?: string } | null>(stored, null)?.sessionToken;
  const res = await fetch(`${base}/api/users/${dbId}/push-token`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify({ token: tokenData.data }),
  });
  if (!res.ok) {
    throw new Error(`Push token registration failed: ${res.status}`);
  }
}
