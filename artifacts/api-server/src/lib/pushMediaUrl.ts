/** Avatar / image URLs safe for FCM notification image (HTTPS only, size-capped). */
export function pushNotificationImageUrl(raw: string | null | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("https://")) return undefined;
  return trimmed.length > 2048 ? trimmed.slice(0, 2048) : trimmed;
}
