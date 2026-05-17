import webpush, { type PushSubscription } from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:support@videh.co.in";

let vapidReady = false;

export function isWebPushConfigured(): boolean {
  return VAPID_PUBLIC_KEY.length > 0 && VAPID_PRIVATE_KEY.length > 0;
}

function ensureVapid(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidReady = true;
  }
  return true;
}

export function parseWebPushSubscription(token: string): PushSubscription | null {
  const raw = token.startsWith("webpush:") ? token.slice("webpush:".length) : token;
  try {
    const parsed = JSON.parse(raw) as PushSubscription;
    if (parsed?.endpoint && parsed?.keys?.p256dh && parsed?.keys?.auth) return parsed;
  } catch {
    // ignore
  }
  return null;
}

export async function sendWebPushChatPush(
  to: string | string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!ensureVapid()) return;

  const tokens = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const payload = JSON.stringify({
    title,
    body,
    data,
    notificationKind: data.notificationKind ?? "chat_message",
  });

  await Promise.all(
    tokens.map(async (token) => {
      const subscription = parseWebPushSubscription(token);
      if (!subscription) return;
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 60 * 60 * 24 });
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          console.warn("Web push subscription expired", { endpoint: subscription.endpoint?.slice(0, 48) });
        } else {
          console.error("Web push send error", err?.message ?? err);
        }
      }
    }),
  );
}
