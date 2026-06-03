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
 * - composer below list; KeyboardStickyView lifts it above keyboard on native
 * - pin after keyboard onEnd (not on every content-size / composer tick)
 * - no auto-pin when user scrolled up (near-bottom threshold)
 * - jump-to-latest FAB when scrolled up (with unread count badge)
 * - older messages pagination at scroll top + maintainVisibleContentPosition
 */

/** Slightly generous so keyboard resize does not falsely mark user as "scrolled up". */
export const WHATSAPP_CHAT_NEAR_BOTTOM_PX = 120;

export const WHATSAPP_KEYBOARD_SETTLE_MS = 420;

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

/** One immediate + follow-up pins after layout/keyboard (avoid triple-jump jitter). */
export const WHATSAPP_PIN_TO_BOTTOM_DELAYS_MS = [0, 80, 200, 360] as const;

/** Scroll a normal (non-inverted) chat list to the visual bottom; retries after layout. */
export function scrollChatListToLatest(
  list: { scrollToEnd: (opts: { animated: boolean }) => void } | null | undefined,
  animated = false,
): void {
  if (!list) return;
  list.scrollToEnd({ animated });
  requestAnimationFrame(() => {
    list.scrollToEnd({ animated: false });
    requestAnimationFrame(() => list.scrollToEnd({ animated: false }));
  });
}

export function shouldWhatsAppAutoPin(userScrolledUp: boolean, searching: boolean): boolean {
  return !searching && !userScrolledUp;
}

/** Short single-line text → inline time + ticks (WhatsApp compact bubble). */
export function isCompactChatText(text: string, maxLen = 52): boolean {
  const t = text.trim();
  if (!t || t.includes("\n")) return false;
  return t.length <= maxLen;
}
