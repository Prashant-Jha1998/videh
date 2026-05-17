/** OneSignal free tier — no Firebase. https://onesignal.com */

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID?.trim() ?? "";
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY?.trim() ?? "";

export function isOneSignalConfigured(): boolean {
  return ONESIGNAL_APP_ID.length > 0 && ONESIGNAL_REST_API_KEY.length > 0;
}

function stringifyData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

export async function sendOneSignalPush(
  userIds: number[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  options?: { isCall?: boolean },
): Promise<void> {
  if (!isOneSignalConfigured() || userIds.length === 0) return;

  const externalIds = [...new Set(userIds.map((id) => String(id)).filter(Boolean))];
  if (externalIds.length === 0) return;

  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_aliases: { external_id: externalIds },
        target_channel: "push",
        headings: { en: title },
        contents: { en: body },
        data: stringifyData(data),
        priority: options?.isCall ? 10 : 5,
        android_channel_id: options?.isCall ? "calls" : "messages",
      }),
    });

    const payload = await res.json().catch(() => null) as { errors?: string[]; id?: string } | null;
    if (!res.ok) {
      console.error("OneSignal push failed", { status: res.status, payload });
    } else if (payload?.errors?.length) {
      console.error("OneSignal push errors", payload.errors);
    }
  } catch (err) {
    console.error("OneSignal push network error", err);
  }
}
