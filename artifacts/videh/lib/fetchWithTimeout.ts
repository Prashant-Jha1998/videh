const DEFAULT_TIMEOUT_MS = 25_000;

/** Abort fetch if the server does not respond in time (prevents hung polls blocking UI). */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const upstream = init?.signal;
  const onAbort = () => controller.abort();
  upstream?.addEventListener("abort", onAbort);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    upstream?.removeEventListener("abort", onAbort);
  }
}
