/** Backup poll while a chat is open (SSE/push are primary). */
export const OPEN_CHAT_MESSAGE_POLL_MS = 3000;

/** AppContext backup when chat open but another screen is focused. */
export const ACTIVE_CHAT_MESSAGE_BACKUP_POLL_MS = 8000;

/** Chat list refresh while app is foreground (catches new messages when SSE is down). */
export const FOREGROUND_CHAT_LIST_POLL_MS = 5000;

/** Defer API merge after optimistic hint (ms). */
export const MESSAGE_HINT_API_DELAY_MS = 200;

/** Second fetch if the server row is not ready yet. */
export const MESSAGE_HINT_API_RETRY_MS = 1200;
