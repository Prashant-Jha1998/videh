/** Videh incoming ring duration before auto-miss (ms). Keep in sync with server RING_TIMEOUT_MS. */
export const INCOMING_RING_TIMEOUT_MS = 45_000;
/** Max time to stay on "Connecting…" before auto-hangup (ms). */
export const CONNECTING_TIMEOUT_MS = 90_000;
/** Backup poll while app is open — SSE/FCM are primary. */
export const INCOMING_CALL_POLL_ACTIVE_MS = 150;
export const INCOMING_CALL_POLL_BACKGROUND_MS = 400;
/** Outgoing call status poll while waiting for callee to accept. */
export const OUTGOING_RING_STATUS_POLL_MS = 200;
