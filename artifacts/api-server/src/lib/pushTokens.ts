import { parseWebPushSubscription } from "./webPush";

export function isExpoPushToken(token: unknown): token is string {
  if (typeof token !== "string" || token.length < 12) return false;
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

export function isWebPushToken(token: unknown): boolean {
  if (typeof token !== "string") return false;
  return parseWebPushSubscription(token) !== null;
}

/** Native FCM (Android) or APNs (iOS) device token from the app. */
export function isFcmPushToken(token: unknown): boolean {
  if (typeof token !== "string") return false;
  if (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")) return false;
  if (parseWebPushSubscription(token) !== null) return false;
  if (token.startsWith("fcm:")) return token.length > 8;
  return token.length >= 20 && /^[A-Za-z0-9_:/\-+=]+$/.test(token);
}

export function isValidPushToken(token: unknown): token is string {
  return typeof token === "string" && (isExpoPushToken(token) || isWebPushToken(token) || isFcmPushToken(token));
}

function pushTokenKind(token: string): "expo" | "webpush" | "fcm" | null {
  if (isExpoPushToken(token)) return "expo";
  if (isWebPushToken(token)) return "webpush";
  if (isFcmPushToken(token)) return "fcm";
  return null;
}

export function splitPushTokens(tokens: string[]): { fcm: string[]; webpush: string[]; expo: string[] } {
  const fcm: string[] = [];
  const webpush: string[] = [];
  const expo: string[] = [];
  for (const token of tokens) {
    const kind = pushTokenKind(token);
    if (kind === "expo") expo.push(token);
    else if (kind === "webpush") webpush.push(token);
    else if (kind === "fcm") fcm.push(token.startsWith("fcm:") ? token.slice(4) : token);
  }
  return { fcm, webpush, expo };
}
