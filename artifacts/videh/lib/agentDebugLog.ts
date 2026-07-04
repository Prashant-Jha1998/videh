/** Removed from production builds — no outbound debug traffic. */
export function agentDebugLog(
  _location: string,
  _message: string,
  _data: Record<string, unknown>,
  _hypothesisId: string,
  _runId?: string,
): void {
  /* no-op */
}
