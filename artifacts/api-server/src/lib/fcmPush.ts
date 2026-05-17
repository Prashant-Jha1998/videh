import { readFileSync } from "node:fs";
import admin from "firebase-admin";
import {
  EXPO_ANDROID_CALLS_CHANNEL_ID,
  EXPO_ANDROID_CHANNEL_ID,
} from "./expoPush";

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

export async function sendFcmChatPush(
  to: string | string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  options?: { isCall?: boolean },
): Promise<void> {
  const messaging = getMessaging();
  if (!messaging) return;

  const tokens = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (tokens.length === 0) return;

  const channelId = options?.isCall ? EXPO_ANDROID_CALLS_CHANNEL_ID : EXPO_ANDROID_CHANNEL_ID;
  const dataPayload = stringifyData(data);

  try {
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: dataPayload,
      android: {
        priority: "high",
        notification: { channelId, sound: "default", priority: "high" as const },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            alert: { title, body },
            "mutable-content": 1,
          },
        },
      },
    });
    if (res.failureCount > 0) {
      const errors = res.responses
        .map((r, i) => (r.success ? null : { token: tokens[i], error: r.error?.message }))
        .filter(Boolean);
      console.error("FCM push partial failure", errors);
    }
  } catch (err) {
    console.error("FCM push error", err);
  }
}
