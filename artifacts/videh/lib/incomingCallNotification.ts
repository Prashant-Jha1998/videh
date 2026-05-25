import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { AppState, Platform } from "react-native";
import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import {
  NOTIFICATION_ACTION_ACCEPT_CALL,
  NOTIFICATION_ACTION_DECLINE_CALL,
  VIDEH_CALLS_CHANNEL_ID,
  VIDEH_INCOMING_CALL_CATEGORY_ID,
} from "@/lib/pushNotifications";

export type IncomingCallNotificationPayload = IncomingCallInfo & {
  callerName: string;
};

function callDeepLink(call: IncomingCallNotificationPayload): string {
  return Linking.createURL(`/call/${call.chatId}`, {
    queryParams: {
      name: call.callerName,
      type: call.type,
      channel: call.channel,
      callId: call.callId,
      incoming: "1",
      ringing: "1",
    },
  });
}

/** High-priority incoming call notification (lock screen + heads-up). */
export async function showIncomingCallNotification(call: IncomingCallNotificationPayload): Promise<void> {
  if (Platform.OS === "web") return;

  const title = call.type === "video" ? "Incoming video call" : "Incoming voice call";
  const body = `${call.callerName} is calling`;

  await Notifications.scheduleNotificationAsync({
    identifier: `incoming_call_${call.callId}`,
    content: {
      title,
      body,
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true,
      autoDismiss: false,
      categoryIdentifier: VIDEH_INCOMING_CALL_CATEGORY_ID,
      data: {
        callId: call.callId,
        chatId: String(call.chatId),
        type: call.type,
        channel: call.channel,
        callerName: call.callerName,
        kind: "call",
      },
    },
    trigger: null,
    ...(Platform.OS === "android"
      ? {
          channelId: VIDEH_CALLS_CHANNEL_ID,
        }
      : {}),
  });

  if (AppState.currentState !== "active" && Platform.OS === "android") {
    try {
      await Linking.openURL(callDeepLink(call));
    } catch {
      /* notification still shows on lock screen */
    }
  }
}

export async function dismissIncomingCallNotification(callId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await Notifications.dismissNotificationAsync(`incoming_call_${callId}`);
  } catch {
    /* ignore */
  }
}

export { NOTIFICATION_ACTION_ACCEPT_CALL, NOTIFICATION_ACTION_DECLINE_CALL };
