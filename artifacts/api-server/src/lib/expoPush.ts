/** Must match the channel created in the Videh app (`lib/pushNotifications.ts`). */
export const EXPO_ANDROID_CHANNEL_ID = "messages";

export function isExpoPushToken(token: unknown): token is string {
  if (typeof token !== "string" || token.length < 12) return false;
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

type ExpoPushSendBody = Record<string, unknown>;

export function sendExpoPush(body: ExpoPushSendBody | ExpoPushSendBody[]): void {
  fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export function sendExpoChatPush(to: string | string[], title: string, body: string, data: Record<string, unknown>): void {
  sendExpoPush({
    to,
    title,
    body,
    data,
    sound: "default",
    priority: "high",
    channelId: EXPO_ANDROID_CHANNEL_ID,
  });
}
