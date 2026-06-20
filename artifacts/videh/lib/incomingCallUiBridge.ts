/** Root overlay ↔ CallSession sync when a call ends or is cancelled remotely. */
let dismissOverlayHandler: ((callId?: string, permanent?: boolean) => void) | null = null;
/** UI-only dismiss (ringing overlay) — must not block on active in-call sessions. */
let dismissSessionHandler: ((callId?: string) => void) | null = null;
/** Server-confirmed terminal events — always tear down session, including active calls. */
let endSessionHandler: ((callId?: string) => void) | null = null;

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

export function registerCallSessionEndHandler(handler: (callId?: string) => void): () => void {
  endSessionHandler = handler;
  return () => {
    if (endSessionHandler === handler) endSessionHandler = null;
  };
}

export function requestDismissIncomingCallUi(callId?: string, permanent = false): void {
  dismissOverlayHandler?.(callId, permanent);
}

export function requestDismissCallSession(callId?: string): void {
  dismissSessionHandler?.(callId);
}

export function requestEndCallSession(callId?: string): void {
  endSessionHandler?.(callId);
}
