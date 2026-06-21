import { getApiUrl } from "./api";

export function webrtcAuthHeaders(sessionToken?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  };
}

/** Default per-request timeout so a hung request fails fast instead of piling up. */
const WEBRTC_FETCH_TIMEOUT_MS = 8000;

export async function webrtcFetch(
  path: string,
  sessionToken?: string | null,
  init?: RequestInit,
  timeoutMs: number = WEBRTC_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${getApiUrl()}/api/webrtc${path}`, {
      cache: "no-store",
      signal: controller.signal,
      ...init,
      headers: {
        ...webrtcAuthHeaders(sessionToken),
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
