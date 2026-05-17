export function isExpoPushToken(token: unknown): token is string {
  if (typeof token !== "string" || token.length < 12) return false;
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

/** App registered via OneSignal external user id (no device token in DB). */
export function isOneSignalLinkedToken(token: unknown): token is string {
  return typeof token === "string" && token.startsWith("onesignal:");
}

export function isFcmPushToken(token: unknown): token is string {
  if (typeof token !== "string" || isExpoPushToken(token) || isOneSignalLinkedToken(token)) return false;
  return token.length >= 20 && /^[A-Za-z0-9_:/\-+=]+$/.test(token);
}

export function isValidPushToken(token: unknown): token is string {
  return isExpoPushToken(token) || isOneSignalLinkedToken(token) || isFcmPushToken(token);
}

export function splitPushTokens(tokens: string[]): { expo: string[] } {
  return { expo: tokens.filter(isExpoPushToken) };
}
