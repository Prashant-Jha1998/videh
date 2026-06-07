/**
 * WhatsApp-style chat scroll (inverted FlatList — same approach as WhatsApp on React Native).
 *
 * WhatsApp rules:
 * 1. Inverted FlatList: index 0 = newest message at visual bottom; offset 0 = "at latest".
 * 2. Chat opens → one quiet pin to offset 0 (no triple-scroll).
 * 3. New messages while at bottom → stay pinned (smooth when 1–2 msgs; quiet when burst).
 * 4. User scrolls up → stop auto-pin; show "New messages" FAB + unread count.
 * 5. User taps FAB → one smooth scroll to offset 0.
 * 6. Keyboard opens at bottom → one quiet pin; no pin when reading history.
 * 7. Keyboard open/close while reading history → preserve viewport (MVCP + no pin calls).
 */

export const WHATSAPP_CHAT_NEAR_BOTTOM_PX = 80;
export const WHATSAPP_CHAT_SCROLL_AWAY_PX = 110;
export const WHATSAPP_CHAT_BACK_TO_BOTTOM_PX = 48;

/** Coalesce duplicate pin requests within the same frame / burst. */
export const SCROLL_PIN_DEBOUNCE_MS = 48;

/** MVCP: block tail autoscroll while user reads history (inverted list). */
export const WHATSAPP_MVCP_FOLLOW_AUTOSCROLL_THRESHOLD = 10;
export const WHATSAPP_MVCP_HISTORY_AUTOSCROLL_THRESHOLD = 1_000_000;

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

/** Smooth scroll for small deltas; quiet pin during keyboard animation or bursts. */
export function shouldAnimateChatPin(
  newMessageDelta: number,
  keyboardAnimating: boolean,
): boolean {
  return newMessageDelta > 0 && newMessageDelta <= 2 && !keyboardAnimating;
}

export function isCompactChatText(text: string, maxLen = 52): boolean {
  const t = text.trim();
  if (!t || t.includes("\n")) return false;
  return t.length <= maxLen;
}
