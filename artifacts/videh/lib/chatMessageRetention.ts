/** Videh policy: show and keep chat messages for 90 days only. */
export const CHAT_MESSAGE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function globalMessageRetentionCutoffMs(now = Date.now()): number {
  return now - CHAT_MESSAGE_RETENTION_MS;
}
