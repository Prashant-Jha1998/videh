/**
 * WhatsApp-style chat list scroll helpers (stack-from-end, pin to latest).
 *
 * Parity checklist (see app/chat/[id].tsx):
 * - stackFromEnd: flexGrow + justifyContent flex-end
 * - composer inset only (not keyboard; resize / KAV handle keyboard)
 * - pin after keyboard onEnd + staged delays
 * - no auto-pin when user scrolled up (near-bottom threshold)
 * - jump-to-latest FAB when scrolled up (with unread count badge)
 * - older messages pagination at scroll top + maintainVisibleContentPosition
 * - composer link preview (OG) affects composer height via onLayout
 */

export const WHATSAPP_CHAT_NEAR_BOTTOM_PX = 80;

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

/** Delays after keyboard / composer layout (matches WhatsApp post-layout scroll). */
export const WHATSAPP_PIN_TO_BOTTOM_DELAYS_MS = [0, 50, 150, 300, 450] as const;
