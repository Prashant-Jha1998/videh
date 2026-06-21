import { getApiUrl } from "./api";

export function webrtcAuthHeaders(sessionToken?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  };
}

export async function webrtcFetch(
  path: string,
  sessionToken?: string | null,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${getApiUrl()}/api/webrtc${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...webrtcAuthHeaders(sessionToken),
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}
