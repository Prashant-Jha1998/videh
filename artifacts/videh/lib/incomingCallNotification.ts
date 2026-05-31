import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { INCOMING_RING_TIMEOUT_MS } from "@/lib/callConstants";
import { resolveCallNotificationSound } from "@/lib/applyNotificationChannels";
import {
  NOTIFICATION_ACTION_ACCEPT_CALL,
  NOTIFICATION_ACTION_DECLINE_CALL,
  VIDEH_INCOMING_CALL_CATEGORY_ID,
} from "@/lib/pushNotifications";

export type IncomingCallNotificationPayload = IncomingCallInfo & {
  callerName: string;
};

/** High-priority incoming call notification (lock screen + heads-up). */
export async function showIncomingCallNotification(call: IncomingCallNotificationPayload): Promise<void> {
  if (Platform.OS === "web") return;

  const title = call.type === "video" ? "Incoming video call" : "Incoming voice call";
  const body = `${call.callerName} is calling`;
  const { sound, channelId } = await resolveCallNotificationSound();
  await Notifications.scheduleNotificationAsync({
    identifier: `incoming_call_${call.callId}`,
    content: {
      title,
      body,
      sound,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
      autoDismiss: false,
      interruptionLevel: "timeSensitive",
      categoryIdentifier: VIDEH_INCOMING_CALL_CATEGORY_ID,
      data: {
        callId: call.callId,
        chatId: String(call.chatId),
        type: call.type,
        channel: call.channel,
        callerName: call.callerName,
        kind: "call",
        notificationKind: "incoming_call",
        deepLink: `videh://call/${call.chatId}?callId=${encodeURIComponent(call.callId)}&incoming=1&ringing=1&type=${call.type}&name=${encodeURIComponent(call.callerName)}&channel=${encodeURIComponent(call.channel)}`,
      },
    },
    trigger: null,
    ...(Platform.OS === "android" && channelId ? { channelId } : {}),
  });

  // Full-screen call UI is opened from _layout when the app wakes (lock screen / background).
}

export { INCOMING_RING_TIMEOUT_MS };

export async function dismissIncomingCallNotification(callId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.dismissNotificationAsync(`incoming_call_${callId}`);
  } catch {
    /* ignore */
  }
}

export { NOTIFICATION_ACTION_ACCEPT_CALL, NOTIFICATION_ACTION_DECLINE_CALL };
