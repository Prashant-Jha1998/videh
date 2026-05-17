import { sendFcmChatPush, isFcmConfigured } from "./fcmPush";
import { sendExpoChatPush, sendExpoPush } from "./expoPush";
import { isExpoPushToken, splitPushTokens } from "./pushTokens";

export { isExpoPushToken, isFcmPushToken, isValidPushToken } from "./pushTokens";
export { isFcmConfigured } from "./fcmPush";

type ChatPushOptions = {
  categoryId?: string;
  threadId?: string;
  isCall?: boolean;
};

/** Send chat/call notification via FCM (preferred) and/or Expo push relay. */
export async function sendChatPush(
  to: string | string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  options?: ChatPushOptions,
): Promise<void> {
  const tokens = (Array.isArray(to) ? to : [to]).filter((t): t is string => typeof t === "string" && t.length > 0);
  if (tokens.length === 0) return;

  const { expo, fcm } = splitPushTokens(tokens);
  const tasks: Promise<void>[] = [];

  if (fcm.length > 0) {
    if (isFcmConfigured()) {
      tasks.push(sendFcmChatPush(fcm, title, body, data, { isCall: options?.isCall }));
    } else {
      console.warn("FCM tokens present but FIREBASE_SERVICE_ACCOUNT_JSON is not set; skipping FCM delivery");
    }
  }

  if (expo.length > 0) {
    sendExpoChatPush(expo, title, body, data, options);
  }

  await Promise.all(tasks);
}

/** Low-level batch send (scheduled messages) — routes each token to FCM or Expo. */
export async function sendPushBatch(
  messages: Array<{
    token: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    isCall?: boolean;
  }>,
): Promise<void> {
  const byExpo = messages.filter((m) => isExpoPushToken(m.token));
  const byFcm = messages.filter((m) => !isExpoPushToken(m.token));

  if (byFcm.length > 0 && isFcmConfigured()) {
    await Promise.all(
      byFcm.map((m) => sendFcmChatPush(m.token, m.title, m.body, m.data, { isCall: m.isCall })),
    );
  }

  if (byExpo.length > 0) {
    sendExpoPush(
      byExpo.map((m) => ({
        to: m.token,
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
