/** Videh chat scroll helpers for web message lists. */

export const CHAT_NEAR_BOTTOM_PX = 80;
export const CHAT_SCROLL_AWAY_PX = 110;
export const CHAT_BACK_TO_BOTTOM_PX = 48;

export function chatDistanceFromBottom(el: HTMLElement): number {
  return el.scrollHeight - el.clientHeight - el.scrollTop;
}

export function isChatNearBottom(el: HTMLElement, threshold = CHAT_NEAR_BOTTOM_PX): boolean {
  return chatDistanceFromBottom(el) <= threshold;
}

/** Hysteresis avoids jitter when content height changes near the bottom threshold. */
export function isChatScrolledUp(el: HTMLElement, currentlyScrolledUp: boolean): boolean {
  const dist = chatDistanceFromBottom(el);
  if (currentlyScrolledUp) return dist > CHAT_BACK_TO_BOTTOM_PX;
  return dist > CHAT_SCROLL_AWAY_PX;
}

export function shouldAutoPinToBottom(userScrolledUp: boolean, searching: boolean): boolean {
  return !searching && !userScrolledUp;
}

/** Pin attempts after opening a chat (images/PDFs load after first paint). */
export const OPEN_CHAT_PIN_DELAYS_MS = [0, 60, 180, 400, 800] as const;
