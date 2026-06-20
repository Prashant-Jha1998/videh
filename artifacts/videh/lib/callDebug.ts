/** Structured WebRTC / call-flow logs for production debugging. */
export function callDebug(event: string, detail?: Record<string, unknown>): void {
  console.log(`[VidehCall] ${event}`, detail ?? "");
}
