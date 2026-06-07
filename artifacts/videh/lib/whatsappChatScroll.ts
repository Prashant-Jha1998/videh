/**
 * WhatsApp-style chat scroll (inverted FlatList — same approach as WhatsApp on React Native).
 *
 * WhatsApp rules:
 * 1. Inverted FlatList: index 0 = newest message at visual bottom; offset 0 = "at latest".
 * 2. New messages while at offset 0 → list stays pinned automatically (no scrollToEnd race).
 * 3. User scrolls up (offset grows) → stop all auto-pin; show ↓ FAB + unread count.
 * 4. User sends or taps ↓ → scrollToOffset(0).
 * 5. Keyboard opens → one quiet pin only if already near bottom.
 * 6. Incoming messages while scrolled up → do not move viewport.
 */

export const WHATSAPP_CHAT_NEAR_BOTTOM_PX = 80;
export const WHATSAPP_CHAT_SCROLL_AWAY_PX = 110;
export const WHATSAPP_CHAT_BACK_TO_BOTTOM_PX = 48;

export const WHATSAPP_PIN_TO_BOTTOM_DELAYS_MS = [0] as const;
export const WHATSAPP_KEYBOARD_PIN_DELAYS_MS = [0, 80] as const;
export const OPEN_CHAT_PIN_DELAYS_MS = [0, 120, 320] as const;

/** Inverted list: offset 0 = visual bottom (latest). */
export function isInvertedChatNearBottom(
  contentOffsetY: number,
  threshold = WHATSAPP_CHAT_NEAR_BOTTOM_PX,
): boolean {
  return contentOffsetY <= threshold;
}

export function isInvertedChatScrolledUp(
  contentOffsetY: number,
  currentlyScrolledUp: boolean,
): boolean {
  if (currentlyScrolledUp) return contentOffsetY > WHATSAPP_CHAT_BACK_TO_BOTTOM_PX;
  return contentOffsetY > WHATSAPP_CHAT_SCROLL_AWAY_PX;
}

/** Non-inverted search list helpers. */
export function chatDistanceFromBottom(
  contentOffsetY: number,
  contentHeight: number,
  layoutHeight: number,
): number {
  return contentHeight - layoutHeight - contentOffsetY;
}

export function isChatNearBottom(
  contentOffsetY: number,
  contentHeight: number,
  layoutHeight: number,
  threshold = WHATSAPP_CHAT_NEAR_BOTTOM_PX,
): boolean {
  return chatDistanceFromBottom(contentOffsetY, contentHeight, layoutHeight) <= threshold;
}

export function isChatScrolledUp(
  contentOffsetY: number,
  contentHeight: number,
  layoutHeight: number,
  currentlyScrolledUp: boolean,
): boolean {
  const dist = chatDistanceFromBottom(contentOffsetY, contentHeight, layoutHeight);
  if (currentlyScrolledUp) return dist > WHATSAPP_CHAT_BACK_TO_BOTTOM_PX;
  return dist > WHATSAPP_CHAT_SCROLL_AWAY_PX;
}

export function shouldWhatsAppAutoPin(userScrolledUp: boolean, searching: boolean): boolean {
  return !searching && !userScrolledUp;
}

export function isCompactChatText(text: string, maxLen = 52): boolean {
  const t = text.trim();
  if (!t || t.includes("\n")) return false;
  return t.length <= maxLen;
}
