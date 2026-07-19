import { sendFcmChatPush, isFcmConfigured } from "./fcmPush";
import { sendWebPushChatPush, isWebPushConfigured } from "./webPush";
import { sendExpoChatPush, sendExpoPush, EXPO_CHAT_MESSAGE_CATEGORY_ID } from "./expoPush";
import { isValidPushToken, splitPushTokens } from "./pushTokens";

export { isExpoPushToken, isFcmPushToken, isWebPushToken, isValidPushToken } from "./pushTokens";
export { isFcmConfigured } from "./fcmPush";
export { isWebPushConfigured } from "./webPush";

type ChatPushOptions = {
  categoryId?: string;
  threadId?: string;
  isCall?: boolean;
  imageUrl?: string;
  messageSoundId?: string;
};

export type NotifyMember = {
  user_id: number;
  push_token: string | null;
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
      tasks.push(sendFcmChatPush(fcm, title, body, data, {
        isCall: options?.isCall,
        categoryId: options?.categoryId,
        imageUrl: options?.imageUrl,
        threadId: options?.threadId,
        messageSoundId: options?.messageSoundId,
      }));
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

/** Per-recipient FCM/Expo push with premium message sound from DB prefs. */
export async function sendChatPushToMembers(
  members: NotifyMember[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  options: {
    isGroup: boolean;
    categoryId?: string;
    threadId?: string;
    imageUrl?: string;
    chatId: string;
  },
): Promise<void> {
  const { resolveUserMessageSoundId } = await import("./soundPrefsDb");
  const { shouldSendPushForKind, getNotificationPrefs } = await import("./notificationPrefs");
  for (const m of members) {
    if (!isValidPushToken(m.push_token)) continue;
    const uid = Number(m.user_id);
    const kind = options.isGroup ? "groups" : "messages";
    if (!(await shouldSendPushForKind(uid, kind))) continue;
    const prefs = await getNotificationPrefs(uid);
    const pushBody =
      prefs.preview === "none"
        ? "New message"
        : prefs.preview === "name"
          ? "New message"
          : body;
    const pushTitle = prefs.preview === "none" ? "Videh" : title;
    const messageSoundId = await resolveUserMessageSoundId(
      uid,
      options.chatId,
      options.isGroup,
    );
    await sendChatPush(m.push_token!, pushTitle, pushBody, data, {
      categoryId: options.categoryId,
      threadId: options.threadId,
      imageUrl: options.imageUrl,
      messageSoundId,
    });
  }
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
    await sendFcmChatPush(fcm, first.title, first.body, first.data, {
      isCall: first.isCall,
      categoryId: EXPO_CHAT_MESSAGE_CATEGORY_ID,
    });
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
