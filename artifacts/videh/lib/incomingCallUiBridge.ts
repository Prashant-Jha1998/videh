/** Root overlay ↔ CallSession sync when a call ends or is cancelled remotely. */
let dismissOverlayHandler: ((callId?: string, permanent?: boolean) => void) | null = null;
let dismissSessionHandler: ((callId?: string) => void) | null = null;

export function registerIncomingCallDismissHandler(
  handler: (callId?: string, permanent?: boolean) => void,
): () => void {
  dismissOverlayHandler = handler;
  return () => {
    if (dismissOverlayHandler === handler) dismissOverlayHandler = null;
  };
}

export function registerCallSessionDismissHandler(handler: (callId?: string) => void): () => void {
  dismissSessionHandler = handler;
  return () => {
    if (dismissSessionHandler === handler) dismissSessionHandler = null;
  };
}

export function requestDismissIncomingCallUi(callId?: string, permanent = false): void {
  dismissOverlayHandler?.(callId, permanent);
}

export function requestDismissCallSession(callId?: string): void {
  dismissSessionHandler?.(callId);
}
