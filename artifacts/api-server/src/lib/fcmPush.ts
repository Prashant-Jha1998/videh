import { readFileSync } from "node:fs";
import admin from "firebase-admin";
import {
  EXPO_ANDROID_CALLS_CHANNEL_ID,
  EXPO_ANDROID_CHANNEL_ID,
  EXPO_CHAT_MESSAGE_CATEGORY_ID,
  EXPO_INCOMING_CALL_CATEGORY_ID,
} from "./expoPush";
import { fcmMessageSoundAndroid, fcmMessageSoundIos } from "./soundPrefsDb";
import { splitFcmTokensByPlatform } from "./pushTokens";

let initAttempted = false;

function loadServiceAccount(): admin.ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      return JSON.parse(raw) as admin.ServiceAccount;
    } catch {
      console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
      return null;
    }
  }
  const credPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (credPath) {
    try {
      return JSON.parse(readFileSync(credPath, "utf8")) as admin.ServiceAccount;
    } catch (err) {
      console.error("Could not load FIREBASE_SERVICE_ACCOUNT_PATH", err);
      return null;
    }
  }
  return null;
}

export function isFcmConfigured(): boolean {
  if (admin.apps.length > 0) return true;
  return Boolean(loadServiceAccount());
}

function getMessaging(): admin.messaging.Messaging | null {
  if (!initAttempted) {
    initAttempted = true;
    const account = loadServiceAccount();
    if (account) {
      try {
        admin.initializeApp({ credential: admin.credential.cert(account) });
      } catch (err) {
        console.error("Firebase Admin init failed", err);
      }
    }
  }
  if (!admin.apps.length) return null;
  return admin.messaging();
}

function stringifyData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

const CALL_RING_TTL_MS = 30_000;

async function sendFcmMulticast(
  messaging: admin.messaging.Messaging,
  tokens: string[],
  message: admin.messaging.MulticastMessage,
): Promise<void> {
  if (tokens.length === 0) return;
  const res = await messaging.sendEachForMulticast({ ...message, tokens });
  if (res.failureCount > 0) {
    const errors = res.responses
      .map((r, i) => (r.success ? null : { token: tokens[i]?.slice(0, 12), error: r.error?.message }))
      .filter(Boolean);
    console.error("FCM partial failure", errors);
  }
}

/** Send via Firebase Cloud Messaging (Android FCM / iOS APNs). */
export async function sendFcmChatPush(
  to: string | string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  options?: {
    isCall?: boolean;
    categoryId?: string;
    imageUrl?: string;
    threadId?: string;
    /** Premium message tone (e.g. msg_romantic). */
    messageSoundId?: string;
  },
): Promise<void> {
  const messaging = getMessaging();
  if (!messaging) return;

  const tokens = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (tokens.length === 0) return;

  const msgSound = options?.messageSoundId ?? "msg_default";
  const androidTone = options?.isCall
    ? { channelId: EXPO_ANDROID_CALLS_CHANNEL_ID, sound: "default" as const }
    : fcmMessageSoundAndroid(msgSound);
  const channelId = androidTone.channelId;
  const iosSound = options?.isCall ? "default" : fcmMessageSoundIos(msgSound);
  const categoryId =
    options?.categoryId
    ?? (options?.isCall ? EXPO_INCOMING_CALL_CATEGORY_ID : EXPO_CHAT_MESSAGE_CATEGORY_ID);
  const callId = options?.isCall ? String(data.callId ?? "") : "";
  const dataPayload = stringifyData(
    options?.isCall
      ? {
          ...data,
          channelId,
          categoryId: categoryId ?? EXPO_INCOMING_CALL_CATEGORY_ID,
          sticky: "true",
          autoDismiss: "false",
          priority: "high",
          ...(callId ? { tag: `videh_call_${callId}` } : {}),
        }
      : {
          ...data,
          title,
          message: body,
          channelId,
          ...(categoryId ? { categoryId } : {}),
        },
  );

  try {
    if (options?.isCall) {
      const { android, ios } = splitFcmTokensByPlatform(tokens);

      // Android: data-only wakes JS → CallKeep + local full-screen notification (Videh).
      await sendFcmMulticast(messaging, android, {
        data: dataPayload,
        android: {
          priority: "high",
          ttl: CALL_RING_TTL_MS,
        },
      });

      // iOS: time-sensitive alert + content-available so CallKeep can register incoming call.
      await sendFcmMulticast(messaging, ios, {
        notification: { title, body },
        data: dataPayload,
        apns: {
          headers: { "apns-priority": "10", "apns-push-type": "alert" },
          payload: {
            aps: {
              sound: iosSound,
              alert: { title, body },
              "interruption-level": "time-sensitive",
              "content-available": 1,
              category: categoryId ?? EXPO_INCOMING_CALL_CATEGORY_ID,
            },
          },
        },
      });

      return;
    }

    const { android, ios } = splitFcmTokensByPlatform(tokens);

    // Android: data-only so foreground JS receives the event instantly (notification shown locally).
    await sendFcmMulticast(messaging, android, {
      data: dataPayload,
      android: {
        priority: "high",
      },
    });

    await sendFcmMulticast(messaging, ios, {
      notification: { title, body },
      data: dataPayload,
      apns: {
        payload: {
          aps: {
            sound: iosSound,
            alert: { title, body },
            category: categoryId,
          },
        },
      },
    });
  } catch (err) {
    console.error("FCM push error", err);
  }
}
