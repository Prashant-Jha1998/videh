import { getApiUrl } from "@/lib/api";
import { authFetchHeaders } from "@/lib/authenticatedMedia";
import {
  encodeLocationPayload,
  mapsUrl,
  type LocationMessagePayload,
} from "@/lib/locationMessage";

export type SendChatLocationResult =
  | { ok: true; messageId: string }
  | { ok: false; status: number; message: string };

/** POST a location / live-location message to a chat (requires session auth). */
export async function sendChatLocationMessage(args: {
  chatId: string;
  senderId: number;
  sessionToken?: string | null;
  payload: LocationMessagePayload;
}): Promise<SendChatLocationResult> {
  const { chatId, senderId, sessionToken, payload } = args;
  const content = encodeLocationPayload(payload);
  const mediaUrl = mapsUrl(payload.lat, payload.lng);

  const res = await fetch(`${getApiUrl()}/api/chats/${chatId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authFetchHeaders(sessionToken) as Record<string, string>),
    },
    body: JSON.stringify({
      senderId,
      content,
      type: "location",
      mediaUrl,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: { id: number } | string;
    code?: string;
  };

  if (res.status === 401) {
    return { ok: false, status: 401, message: "Your session expired. Please sign in again." };
  }
  if (res.status === 403) {
    const msg =
      typeof data.message === "string"
        ? data.message
        : "You are not allowed to send messages in this chat.";
    return { ok: false, status: 403, message: msg };
  }
  if (!res.ok) {
    return { ok: false, status: res.status, message: "Could not send location. Please try again." };
  }
  if (data?.success && data.message && typeof data.message === "object" && data.message.id != null) {
    return { ok: true, messageId: String(data.message.id) };
  }
  return { ok: false, status: res.status, message: "Could not send location. Please try again." };
}
