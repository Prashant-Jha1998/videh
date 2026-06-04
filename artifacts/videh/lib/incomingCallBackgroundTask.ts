import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import {
  extractPushDataFromTaskPayload,
  isIncomingCallPushData,
  presentIncomingCallFromPush,
} from "@/lib/incomingCallPush";

export const VIDEH_INCOMING_CALL_BG_TASK = "VIDEH_INCOMING_CALL_BACKGROUND";

TaskManager.defineTask<Notifications.NotificationTaskPayload>(VIDEH_INCOMING_CALL_BG_TASK, ({ data, error }) => {
  if (error || Platform.OS === "web" || !data) {
    return;
  }

  if ("actionIdentifier" in data) {
    return;
  }

  const payload = extractPushDataFromTaskPayload(data);
  if (!payload || !isIncomingCallPushData(payload)) {
    return;
  }

  void presentIncomingCallFromPush(payload, { scheduleLocalNotification: true });
});

void Notifications.registerTaskAsync(VIDEH_INCOMING_CALL_BG_TASK).catch(() => {});
