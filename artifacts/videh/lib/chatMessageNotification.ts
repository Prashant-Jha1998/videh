import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { agentDebugLog } from "@/lib/agentDebugLog";
import { resolveMessageNotificationSound } from "@/lib/applyNotificationChannels";
import {
  NOTIFICATION_ACTION_MARK_READ,
  NOTIFICATION_ACTION_MUTE,
  NOTIFICATION_ACTION_REPLY,
  VIDEH_CHAT_MESSAGE_CATEGORY_ID,
} from "@/lib/pushNotifications";

export type ChatMessageNotificationPayload = {
  chatId: string;
  messageId?: string;
  senderId?: string;
  senderName: string;
  body: string;
  avatarUrl?: string | null;
  isGroup?: boolean;
};

/** WhatsApp-style local notification: avatar + inline Reply / Mark read / Mute. */
export async function showChatMessageNotification(payload: ChatMessageNotificationPayload): Promise<void> {
  if (Platform.OS === "web") return;
  agentDebugLog(
    "chatMessageNotification.ts:showChatMessageNotification",
    "local message notification fired",
    { chatId: payload.chatId, isGroup: payload.isGroup ?? false },
    "H1",
  );

  const title = payload.senderName;
  const body = payload.body;
  const avatar = payload.avatarUrl?.trim();
  const imageOk = avatar?.startsWith("https://");
  const { sound, channelId } = await resolveMessageNotificationSound(
    payload.chatId,
    payload.isGroup ?? false,
  );

  await Notifications.scheduleNotificationAsync({
    identifier: `chat_${payload.chatId}_${payload.messageId ?? Date.now()}`,
    content: {
      title,
      subtitle: Platform.OS === "ios" ? "Videh" : undefined,
      body,
      sound,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      categoryIdentifier: VIDEH_CHAT_MESSAGE_CATEGORY_ID,
      data: {
        chatId: payload.chatId,
        messageId: payload.messageId,
        senderId: payload.senderId,
        senderName: payload.senderName,
        kind: "message",
        notificationKind: "chat_message",
        _videhLocal: true,
      },
      ...(imageOk && Platform.OS === "ios"
        ? {
            attachments: [
              {
                identifier: "avatar",
                url: avatar!,
                type: "image" as const,
              },
            ],
          }
        : {}),
    },
    trigger: null,
    ...(Platform.OS === "android" && channelId ? { channelId } : {}),
  });
}

export async function dismissChatMessageNotifications(chatId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const listed = await Notifications.getPresentedNotificationsAsync();
    for (const n of listed) {
      const data = n.request.content.data as Record<string, unknown> | undefined;
      if (String(data?.chatId ?? "") === String(chatId)) {
        await Notifications.dismissNotificationAsync(n.request.identifier);
      }
    }
  } catch {
    /* ignore */
  }
}

export {
  NOTIFICATION_ACTION_REPLY,
  NOTIFICATION_ACTION_MARK_READ,
  NOTIFICATION_ACTION_MUTE,
};
