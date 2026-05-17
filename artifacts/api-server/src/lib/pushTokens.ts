export function isExpoPushToken(token: unknown): token is string {
  if (typeof token !== "string" || token.length < 12) return false;
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

/** Native FCM (Android) or APNs (iOS) device token — not Expo relay. */
export function isFcmPushToken(token: unknown): token is string {
  if (typeof token !== "string" || isExpoPushToken(token)) return false;
  return token.length >= 20 && /^[A-Za-z0-9_:/\-+=]+$/.test(token);
}

export function isValidPushToken(token: unknown): token is string {
  return isExpoPushToken(token) || isFcmPushToken(token);
}

export function splitPushTokens(tokens: string[]): { expo: string[]; fcm: string[] } {
  const expo: string[] = [];
  const fcm: string[] = [];
  for (const token of tokens) {
    if (isExpoPushToken(token)) expo.push(token);
    else if (isFcmPushToken(token)) fcm.push(token);
  }
  return { expo, fcm };
}
