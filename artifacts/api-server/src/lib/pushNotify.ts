import { sendWebPushChatPush, isWebPushConfigured } from "./webPush";
import { sendExpoChatPush, sendExpoPush } from "./expoPush";
import { isExpoPushToken, isValidPushToken, splitPushTokens } from "./pushTokens";

export { isExpoPushToken, isWebPushToken, isValidPushToken } from "./pushTokens";
export { isWebPushConfigured } from "./webPush";

type ChatPushOptions = {
  categoryId?: string;
  threadId?: string;
  isCall?: boolean;
};

/** VAPID Web Push (your keys) first; Expo push relay as fallback for mobile. */
export async function sendChatPush(
  to: string | string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  options?: ChatPushOptions,
): Promise<void> {
  const tokens = (Array.isArray(to) ? to : [to]).filter((t): t is string => isValidPushToken(t));
  if (tokens.length === 0) return;

  const { webpush, expo } = splitPushTokens(tokens);
  const tasks: Promise<void>[] = [];

  if (webpush.length > 0) {
    if (isWebPushConfigured()) {
      tasks.push(sendWebPushChatPush(webpush, title, body, data));
    } else {
      console.warn("Web push tokens present but VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set on server");
    }
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
  const webpush = messages.filter((m) => m.token && !isExpoPushToken(m.token)).map((m) => m.token!);
  const expo = messages.filter((m) => m.token && isExpoPushToken(m.token));

  if (webpush.length > 0 && isWebPushConfigured()) {
    const first = messages.find((m) => m.token && !isExpoPushToken(m.token))!;
    await sendWebPushChatPush(webpush, first.title, first.body, first.data);
  }

  if (expo.length > 0) {
    sendExpoPush(
      expo.map((m) => ({
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
