import { sendFcmChatPush, isFcmConfigured } from "./fcmPush";
import { sendWebPushChatPush, isWebPushConfigured } from "./webPush";
import { sendExpoChatPush, sendExpoPush } from "./expoPush";
import { isValidPushToken, splitPushTokens } from "./pushTokens";

export { isExpoPushToken, isFcmPushToken, isWebPushToken, isValidPushToken } from "./pushTokens";
export { isFcmConfigured } from "./fcmPush";
export { isWebPushConfigured } from "./webPush";

type ChatPushOptions = {
  categoryId?: string;
  threadId?: string;
  isCall?: boolean;
};

/** FCM (Videh on Android) → Web Push (web) → Expo relay fallback. */
export async function sendChatPush(
  to: string | string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  options?: ChatPushOptions,
): Promise<void> {
  const tokens = (Array.isArray(to) ? to : [to]).filter((t): t is string => isValidPushToken(t));
  if (tokens.length === 0) return;

  const { fcm, webpush, expo } = splitPushTokens(tokens);
  const tasks: Promise<void>[] = [];

  if (fcm.length > 0) {
    if (isFcmConfigured()) {
      tasks.push(sendFcmChatPush(fcm, title, body, data, { isCall: options?.isCall }));
    } else {
      console.warn("FCM tokens present but FIREBASE_SERVICE_ACCOUNT_JSON is not set on server");
    }
  }

  if (webpush.length > 0 && isWebPushConfigured()) {
    tasks.push(sendWebPushChatPush(webpush, title, body, data));
  }

  if (expo.length > 0) {
    sendExpoChatPush(expo, title, body, data, options);
  }

  await Promise.all(tasks);
}

export async function sendPushBatch(
  messages: Array<{
    token?: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    isCall?: boolean;
  }>,
): Promise<void> {
  const tokens = messages.map((m) => m.token).filter((t): t is string => Boolean(t && isValidPushToken(t)));
  if (tokens.length === 0) return;

  const { fcm, webpush, expo } = splitPushTokens(tokens);
  const first = messages[0];

  if (fcm.length > 0 && isFcmConfigured()) {
    await sendFcmChatPush(fcm, first.title, first.body, first.data, { isCall: first.isCall });
  }

  if (webpush.length > 0 && isWebPushConfigured()) {
    await sendWebPushChatPush(webpush, first.title, first.body, first.data);
  }

  if (expo.length > 0) {
    sendExpoPush(
      messages
        .filter((m) => m.token && splitPushTokens([m.token]).expo.length > 0)
        .map((m) => ({
          to: m.token!,
          title: m.title,
          body: m.body,
          data: m.data,
          sound: "default",
          priority: "high",
          channelId: m.isCall ? "calls" : "messages",
        })),
    );
  }
}
