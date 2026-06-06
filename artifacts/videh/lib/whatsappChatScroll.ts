/**
 * WhatsApp-style chat list scroll helpers (stack-from-end, pin to latest).
 *
 * WhatsApp rules (do not fight the user):
 * 1. Normal list (not inverted): oldest at top, newest at bottom (`justifyContent: flex-end`).
 * 2. Auto-scroll to latest ONLY when the user is already near the bottom (~80px).
 * 3. User scrolls up → stop all auto-pin; show ↓ FAB + unread count below.
 * 4. User sends a message or taps ↓ → force pin once.
 * 5. Keyboard opens → at most one quiet pin if already at bottom (no loop on every layout).
 * 6. New incoming messages while scrolled up → do not move the viewport.
 *
 * Parity checklist (see app/chat/[id].tsx):
 * - stackFromEnd: flexGrow + justifyContent flex-end
 * - composer below list on native (not overlay); resize / KAV handle keyboard
 * - pin after keyboard onEnd (not on every content-size / composer tick)
 * - no auto-pin when user scrolled up (near-bottom threshold)
 * - jump-to-latest FAB when scrolled up (with unread count badge)
 * - older messages pagination at scroll top + maintainVisibleContentPosition
 */

export const WHATSAPP_CHAT_NEAR_BOTTOM_PX = 80;
/** User must scroll past this to leave the bottom zone (hysteresis). */
export const WHATSAPP_CHAT_SCROLL_AWAY_PX = 110;
/** User must return within this to re-enter the bottom zone (hysteresis). */
export const WHATSAPP_CHAT_BACK_TO_BOTTOM_PX = 48;

/** Distance from the visual bottom of a normal (non-inverted) message list. */
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

/** Hysteresis avoids jitter when content height changes near the bottom threshold. */
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

/** One immediate pin; keyboard end may schedule a second post-layout pin. */
export const WHATSAPP_PIN_TO_BOTTOM_DELAYS_MS = [0] as const;
export const WHATSAPP_KEYBOARD_PIN_DELAYS_MS = [0, 180] as const;
/** Pin after opening a chat (media cells resize after first layout). */
export const OPEN_CHAT_PIN_DELAYS_MS = [0, 60, 180, 400, 800] as const;

export function shouldWhatsAppAutoPin(userScrolledUp: boolean, searching: boolean): boolean {
  return !searching && !userScrolledUp;
}

/** Short single-line text → inline time + ticks (WhatsApp compact bubble). */
export function isCompactChatText(text: string, maxLen = 52): boolean {
  const t = text.trim();
  if (!t || t.includes("\n")) return false;
  return t.length <= maxLen;
}
