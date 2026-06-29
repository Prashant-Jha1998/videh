import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  isHeyFriendWakeNativeAvailable,
  startHeyFriendWakeService,
  stopHeyFriendWakeService,
} from "./heyFriendWakeService";

const WAKE_CHANNEL_ID = "videh-hey-friend-wake";
const WAKE_NOTIFICATION_ID = "videh-hey-friend-wake-active";

async function dismissExpoWakeNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(WAKE_NOTIFICATION_ID);
  } catch { /* ignore */ }
}

/** Remove leftover notifications from older builds. */
export async function dismissStaleWakeNotifications(): Promise<void> {
  if (Platform.OS === "web") return;
  await dismissExpoWakeNotification();
}

async function ensureWakeChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(WAKE_CHANNEL_ID, {
    name: "Videh Assistant",
    description: "Background listening for Hey Friend",
    importance: Notifications.AndroidImportance.MIN,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: null,
    vibrationPattern: [0],
  });
}

/** iOS background audio only — Android uses native FG service in background. */
export async function startWakeKeepAlive(): Promise<void> {
  if (Platform.OS === "web") return;
  if (Platform.OS === "android") return;

  const { Audio, InterruptionModeAndroid, InterruptionModeIOS } = await import("expo-av");
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
  } catch { /* ignore */ }

  await ensureWakeChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: WAKE_NOTIFICATION_ID,
    content: {
      title: "Videh Assistant",
      body: 'Say "Hey Friend"',
      sticky: true,
      priority: Notifications.AndroidNotificationPriority.MIN,
      ...(Platform.OS === "android" ? { channelId: WAKE_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

export async function stopWakeKeepAlive(): Promise<void> {
  await dismissExpoWakeNotification();
  if (Platform.OS === "android" && isHeyFriendWakeNativeAvailable()) {
    stopHeyFriendWakeService();
  }
}

/** Native FG service — only while app is in background (shows system notification). */
export function startAndroidBackgroundWake(): void {
  if (Platform.OS !== "android" || !isHeyFriendWakeNativeAvailable()) return;
  startHeyFriendWakeService();
}

export function stopAndroidBackgroundWake(): void {
  if (Platform.OS !== "android" || !isHeyFriendWakeNativeAvailable()) return;
  stopHeyFriendWakeService();
}
