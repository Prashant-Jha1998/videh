/** Debug session logging (removed after verification). */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
  runId = "pre-fix",
): void {
  // #region agent log
  fetch("http://127.0.0.1:7853/ingest/3663ebd0-7a4c-4395-8185-440d4a68bc81", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "5b4712" },
    body: JSON.stringify({
      sessionId: "5b4712",
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  if (__DEV__) {
    console.warn(`[debug-5b4712] ${location} ${message}`, data);
  }
  // #endregion
}
