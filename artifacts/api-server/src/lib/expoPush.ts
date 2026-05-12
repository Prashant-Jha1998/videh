/** Must match the channel created in the Videh app (`lib/pushNotifications.ts`). */
export const EXPO_ANDROID_CHANNEL_ID = "messages";
export const EXPO_CHAT_MESSAGE_CATEGORY_ID = "chat_message";
export const EXPO_INCOMING_CALL_CATEGORY_ID = "incoming_call";
const EXPO_PUSH_CHUNK_SIZE = 100;

export function isExpoPushToken(token: unknown): token is string {
  if (typeof token !== "string" || token.length < 12) return false;
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

type ExpoPushSendBody = Record<string, unknown>;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function sendExpoPush(body: ExpoPushSendBody | ExpoPushSendBody[]): Promise<void> {
  const messages = Array.isArray(body) ? body : [body];
  for (const batch of chunk(messages, EXPO_PUSH_CHUNK_SIZE)) {
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch.length === 1 ? batch[0] : batch),
      });
      const payload = await res.json().catch(() => null) as { data?: unknown } | null;
      if (!res.ok) {
        console.error("Expo push request failed", { status: res.status, payload });
      } else if (payload?.data) {
        const tickets = Array.isArray(payload.data) ? payload.data : [payload.data];
        const errors = tickets.filter((ticket: any) => ticket?.status === "error");
        if (errors.length > 0) console.error("Expo push ticket errors", errors);
      }
    } catch (err) {
      console.error("Expo push network error", err);
    }
  }
}

export function sendExpoChatPush(
  to: string | string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  options?: { categoryId?: string; threadId?: string },
): void {
  const tokens = Array.isArray(to) ? to : [to];
  void sendExpoPush(tokens.map((token) => ({
    to: token,
    title,
    body,
    data,
    sound: "default",
    priority: "high",
    channelId: EXPO_ANDROID_CHANNEL_ID,
    categoryId: options?.categoryId,
    threadId: options?.threadId,
  })));
}
