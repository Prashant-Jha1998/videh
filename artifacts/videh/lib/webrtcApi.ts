import { videhSignalingFetch, webrtcAuthHeaders } from "./videhCall/signalingClient";

export { webrtcAuthHeaders };

/** All WebRTC API calls go through the Videh signaling client (retries, clear errors). */
export async function webrtcFetch(
  path: string,
  sessionToken?: string | null,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const isPoll = init?.method === undefined || init.method === "GET";
  return videhSignalingFetch(path, sessionToken, init, {
    timeoutMs: timeoutMs ?? (isPoll ? 30000 : 60000),
    retries: isPoll ? 0 : 1,
  });
}
