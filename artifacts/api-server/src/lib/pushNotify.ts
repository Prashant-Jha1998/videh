import { sendOneSignalPush, isOneSignalConfigured } from "./oneSignalPush";
import { sendExpoChatPush, sendExpoPush } from "./expoPush";
import { isExpoPushToken, isValidPushToken, splitPushTokens } from "./pushTokens";

export { isExpoPushToken, isFcmPushToken, isValidPushToken } from "./pushTokens";
export { isOneSignalConfigured } from "./oneSignalPush";

type ChatPushOptions = {
  categoryId?: string;
  threadId?: string;
  isCall?: boolean;
  /** Videh user ids — used with OneSignal (free, no Firebase). */
  userIds?: number[];
};

/**
 * Send push: OneSignal (by user id, free) first, then Expo token relay as fallback.
 */
export async function sendChatPush(
  to: string | string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  options?: ChatPushOptions,
): Promise<void> {
  const tokens = (Array.isArray(to) ? to : [to]).filter((t): t is string => isValidPushToken(t));
  const userIds = (options?.userIds ?? []).filter((id) => Number.isFinite(id) && id > 0);

  const tasks: Promise<void>[] = [];

  if (userIds.length > 0 && isOneSignalConfigured()) {
    tasks.push(sendOneSignalPush(userIds, title, body, data, { isCall: options?.isCall }));
  }

  if (tokens.length > 0) {
    const { expo } = splitPushTokens(tokens);
    if (expo.length > 0) {
      sendExpoChatPush(expo, title, body, data, options);
    }
  }

  await Promise.all(tasks);
}

export async function sendPushBatch(
  messages: Array<{
    token?: string;
    userId?: number;
    title: string;
    body: string;
    data: Record<string, unknown>;
    isCall?: boolean;
  }>,
): Promise<void> {
  const userIds = messages.map((m) => m.userId).filter((id): id is number => Number.isFinite(id) && id! > 0);
  if (userIds.length > 0 && isOneSignalConfigured()) {
    const first = messages[0];
    await sendOneSignalPush(userIds, first.title, first.body, first.data, { isCall: first.isCall });
  }

  const expoMessages = messages.filter((m) => m.token && isExpoPushToken(m.token));
  if (expoMessages.length > 0) {
    sendExpoPush(
      expoMessages.map((m) => ({
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
