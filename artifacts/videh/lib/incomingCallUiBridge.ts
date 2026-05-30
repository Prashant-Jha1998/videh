/** Lets CallSession dismiss the root incoming-call overlay when a call ends. */
let dismissHandler: ((callId?: string) => void) | null = null;

export function registerIncomingCallDismissHandler(handler: (callId?: string) => void): () => void {
  dismissHandler = handler;
  return () => {
    if (dismissHandler === handler) dismissHandler = null;
  };
}

export function requestDismissIncomingCallUi(callId?: string): void {
  dismissHandler?.(callId);
}
