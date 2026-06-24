/** Body text from FCM data-only chat pushes (`message`) or notification content. */
export function extractChatPushBody(
  data: Record<string, unknown> | null | undefined,
  notificationBody?: string | null,
): string | undefined {
  const fromData =
    typeof data?.message === "string"
      ? data.message.trim()
      : typeof data?.body === "string"
        ? data.body.trim()
        : "";
  const fromContent = notificationBody?.trim() ?? "";
  const merged = fromData || fromContent;
  return merged || undefined;
}
