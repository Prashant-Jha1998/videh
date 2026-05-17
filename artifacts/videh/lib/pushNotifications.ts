import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/api";
import { safeJsonParse } from "@/lib/safeJson";
import { encodeWebPushToken, getWebPushSubscriptionJson } from "@/lib/vapidPush";

export const VIDEH_PUSH_CHANNEL_ID = "messages";
export const VIDEH_CALLS_CHANNEL_ID = "calls";
export const VIDEH_CHAT_MESSAGE_CATEGORY_ID = "chat_message";
export const VIDEH_INCOMING_CALL_CATEGORY_ID = "incoming_call";
export const NOTIFICATION_ACTION_REPLY = "reply";
export const NOTIFICATION_ACTION_MARK_READ = "mark_read";
export const NOTIFICATION_ACTION_MUTE = "mute_chat";
export const NOTIFICATION_ACTION_ACCEPT_CALL = "accept_call";
export const NOTIFICATION_ACTION_DECLINE_CALL = "decline_call";

export async function ensureVidehNotificationSetup(): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.setNotificationCategoryAsync(VIDEH_CHAT_MESSAGE_CATEGORY_ID, [
    {
      identifier: NOTIFICATION_ACTION_REPLY,
      buttonTitle: "Reply",
      textInput: { submitButtonTitle: "Send", placeholder: "Message" },
      options: { opensAppToForeground: false },
    } as any,
    {
      identifier: NOTIFICATION_ACTION_MARK_READ,
      buttonTitle: "Mark as read",
      options: { opensAppToForeground: false },
    },
    {
      identifier: NOTIFICATION_ACTION_MUTE,
      buttonTitle: "Mute",
      options: { opensAppToForeground: false },
    },
  ] as any);
  await Notifications.setNotificationCategoryAsync(VIDEH_INCOMING_CALL_CATEGORY_ID, [
    {
      identifier: NOTIFICATION_ACTION_ACCEPT_CALL,
      buttonTitle: "Answer",
      options: { opensAppToForeground: true },
    },
    {
      identifier: NOTIFICATION_ACTION_DECLINE_CALL,
      buttonTitle: "Decline",
      options: { opensAppToForeground: false, isDestructive: true },
    },
  ] as any);
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(VIDEH_PUSH_CHANNEL_ID, {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    sound: "default",
  });
  await Notifications.setNotificationChannelAsync(VIDEH_CALLS_CHANNEL_ID, {
    name: "Calls",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    sound: "default",
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export const ensureVidehAndroidNotificationChannel = ensureVidehNotificationSetup;

function getExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

function getVapidPublicKey(): string | undefined {
  const extra = Constants.expoConfig?.extra as { vapidPublicKey?: string } | undefined;
  return extra?.vapidPublicKey?.trim() || process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY?.trim();
}

export type PushProvider = "fcm" | "expo" | "webpush";

async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Native: FCM device token (WhatsApp-style on Android).
 * Web: optional VAPID subscription.
 * Expo Go fallback: Expo push token.
 */
export async function registerPushTokenWithServer(dbId: number): Promise<void> {
  if (!dbId) return;
  await ensureVidehNotificationSetup();

  if (!(await requestNotificationPermission())) {
    throw new Error("Notification permission not granted");
  }

  let token: string | null = null;
  let provider: PushProvider = "fcm";

  if (Platform.OS === "web") {
    const vapidPublicKey = getVapidPublicKey();
    if (vapidPublicKey) {
      const subscription = await getWebPushSubscriptionJson(vapidPublicKey);
      if (subscription) {
        token = encodeWebPushToken(subscription);
        provider = "webpush";
      }
    }
  }

  if (!token && Platform.OS !== "web") {
    try {
      const device = await Notifications.getDevicePushTokenAsync();
      if (device?.data && device.data.length >= 20) {
        token = device.data;
        provider = "fcm";
      }
    } catch {
      // google-services.json missing or Expo Go
    }
  }

  if (!token) {
    const projectId = getExpoProjectId();
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
    token = tokenData.data;
    provider = "expo";
  }

  const base = getApiUrl();
  const stored = await AsyncStorage.getItem("videh_user");
  const sessionToken = safeJsonParse<{ sessionToken?: string } | null>(stored, null)?.sessionToken;
  const res = await fetch(`${base}/api/users/${dbId}/push-token`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify({ token, provider }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Push token registration failed: ${res.status} ${body}`);
  }
}

export const registerExpoPushTokenWithServer = registerPushTokenWithServer;
