import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  isHeyFriendWakeNativeAvailable,
  startHeyFriendWakeService,
  stopHeyFriendWakeService,
} from "./heyFriendWakeService";

const WAKE_CHANNEL_ID = "videh-hey-friend-wake";
const WAKE_NOTIFICATION_ID = "videh-hey-friend-wake-active";

async function ensureWakeChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(WAKE_CHANNEL_ID, {
    name: "Videh Assistant",
    description: "Listens for Hey Friend on lock screen and in background",
    importance: Notifications.AndroidImportance.LOW,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: null,
    vibrationPattern: [0],
  });
}

/** Keeps mic + speech eligible (iOS) or starts native FG service (Android). */
export async function startWakeKeepAlive(): Promise<void> {
  if (Platform.OS === "web") return;

  if (Platform.OS === "android" && isHeyFriendWakeNativeAvailable()) {
    startHeyFriendWakeService();
    return;
  }

  if (Platform.OS === "ios") {
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
  }

  await ensureWakeChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: WAKE_NOTIFICATION_ID,
    content: {
      title: "Videh Assistant on",
      body: 'Say "Hey Friend" — lock screen & background',
      sticky: true,
      priority: Notifications.AndroidNotificationPriority.LOW,
      ...(Platform.OS === "android" ? { channelId: WAKE_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

export async function stopWakeKeepAlive(): Promise<void> {
  if (Platform.OS === "android" && isHeyFriendWakeNativeAvailable()) {
    stopHeyFriendWakeService();
    return;
  }
  try {
    await Notifications.dismissNotificationAsync(WAKE_NOTIFICATION_ID);
  } catch { /* ignore */ }
}
