import { parseWebPushSubscription } from "./webPush";

export function isExpoPushToken(token: unknown): token is string {
  if (typeof token !== "string" || token.length < 12) return false;
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

export function isWebPushToken(token: unknown): token is string {
  if (typeof token !== "string") return false;
  return parseWebPushSubscription(token) !== null;
}

export function isValidPushToken(token: unknown): token is string {
  return isExpoPushToken(token) || isWebPushToken(token);
}

export function splitPushTokens(tokens: string[]): { webpush: string[]; expo: string[] } {
  const webpush: string[] = [];
  const expo: string[] = [];
  for (const token of tokens) {
    if (isExpoPushToken(token)) expo.push(token);
    else if (isWebPushToken(token)) webpush.push(token);
  }
  return { webpush, expo };
}
