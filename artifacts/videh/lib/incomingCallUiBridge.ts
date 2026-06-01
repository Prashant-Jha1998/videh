/** Root overlay ↔ CallSession sync when a call ends or is cancelled remotely. */
let dismissOverlayHandler: ((callId?: string) => void) | null = null;
let dismissSessionHandler: ((callId?: string) => void) | null = null;

export function registerIncomingCallDismissHandler(handler: (callId?: string) => void): () => void {
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

export function requestDismissIncomingCallUi(callId?: string): void {
  dismissOverlayHandler?.(callId);
}

export function requestDismissCallSession(callId?: string): void {
  dismissSessionHandler?.(callId);
}
