/**
 * Videh self-hosted call signaling (AWS EC2 API) — reliable HTTP layer for WebRTC SDP/ICE exchange.
 * No AbortController (avoids confusing "aborted" errors on slow mobile networks).
 */
import { getApiUrl } from "../api";

export function webrtcAuthHeaders(sessionToken?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
  };
}

export function normalizeCallNetworkError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/aborted|AbortError/i.test(msg)) {
    return new Error("Could not reach Videh server — check internet and try again");
  }
  if (/network request failed|failed to fetch|timed out|timeout/i.test(msg)) {
    return new Error("Network error — check your connection and try again");
  }
  return e instanceof Error ? e : new Error(msg || "Call signaling failed");
}

type FetchOpts = {
  timeoutMs?: number;
  retries?: number;
};

export async function videhSignalingFetch(
  path: string,
  sessionToken?: string | null,
  init?: RequestInit,
  opts: FetchOpts = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 60000;
  const retries = opts.retries ?? 0;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await Promise.race([
        fetch(`${getApiUrl()}/api/webrtc${path}`, {
          cache: "no-store",
          ...init,
          headers: {
            ...webrtcAuthHeaders(sessionToken),
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
            ...(init?.headers as Record<string, string> | undefined),
          },
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
        }),
      ]);
      return res;
    } catch (e) {
      lastError = normalizeCallNetworkError(e);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error("Call signaling failed");
}

export async function videhSignalingPost(
  path: string,
  body: unknown,
  sessionToken?: string | null,
  opts: FetchOpts = {},
): Promise<Response> {
  return videhSignalingFetch(
    path,
    sessionToken,
    { method: "POST", body: JSON.stringify(body) },
    { timeoutMs: opts.timeoutMs ?? 45000, retries: opts.retries ?? 2, ...opts },
  );
}
