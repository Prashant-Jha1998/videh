/** WhatsApp-style incoming ring duration before auto-miss (ms). Keep in sync with server RING_TIMEOUT_MS. */
export const INCOMING_RING_TIMEOUT_MS = 45_000;
/** Max time to stay on "Connecting…" before auto-hangup (ms). */
export const CONNECTING_TIMEOUT_MS = 90_000;
/** Backup poll while app is open — SSE/FCM are primary. */
export const INCOMING_CALL_POLL_ACTIVE_MS = 300;
export const INCOMING_CALL_POLL_BACKGROUND_MS = 500;
