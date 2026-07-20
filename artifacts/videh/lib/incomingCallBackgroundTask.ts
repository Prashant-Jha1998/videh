import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import {
  extractPushDataFromTaskPayload,
  isIncomingCallPushData,
  presentIncomingCallFromPush,
} from "@/lib/incomingCallPush";
import {
  NOTIFICATION_ACTION_ACCEPT_CALL,
  NOTIFICATION_ACTION_DECLINE_CALL,
} from "@/lib/pushNotifications";
import { rejectIncomingCall } from "@/lib/rejectIncomingCall";
import { loadStoredUser } from "@/lib/secureUserStorage";

export const VIDEH_INCOMING_CALL_BG_TASK = "VIDEH_INCOMING_CALL_BACKGROUND";

TaskManager.defineTask<Notifications.NotificationTaskPayload>(VIDEH_INCOMING_CALL_BG_TASK, ({ data, error }) => {
  if (error) {
    console.warn("[Videh] incoming call background task error", error);
    return;
  }
  if (Platform.OS === "web" || !data) return;

  // Accept / Decline from notification actions while JS is headless.
  if ("actionIdentifier" in data) {
    const actionId = String(data.actionIdentifier ?? "");
    const payload = extractPushDataFromTaskPayload(data);
    if (!payload?.callId) return;
    const callId = String(payload.callId);
    const chatId = Number(payload.chatId) || 0;
    void (async () => {
      const user = await loadStoredUser<{ dbId?: number; sessionToken?: string }>();
      if (!user?.dbId) return;
      if (actionId === NOTIFICATION_ACTION_DECLINE_CALL) {
        await rejectIncomingCall({
          callId,
          userId: user.dbId,
          sessionToken: user.sessionToken,
        });
        return;
      }
      if (actionId === NOTIFICATION_ACTION_ACCEPT_CALL) {
        const callerName = encodeURIComponent(String(payload.callerName ?? "Videh user"));
        const channel = encodeURIComponent(String(payload.channel ?? ""));
        const type = String(payload.type ?? "audio") === "video" ? "video" : "audio";
        const deepLink =
          `videh://call/${chatId}?callId=${encodeURIComponent(callId)}` +
          `&incoming=1&ringing=1&accept=1&type=${type}&name=${callerName}&channel=${channel}`;
        await Linking.openURL(deepLink).catch(() => {});
      }
    })();
    return;
  }

  const payload = extractPushDataFromTaskPayload(data);
  if (!payload || !isIncomingCallPushData(payload)) {
    return;
  }

  void presentIncomingCallFromPush(payload, { scheduleLocalNotification: true });
});

void Notifications.registerTaskAsync(VIDEH_INCOMING_CALL_BG_TASK).catch((err) => {
  console.warn("[Videh] could not register incoming call background task", err);
});
