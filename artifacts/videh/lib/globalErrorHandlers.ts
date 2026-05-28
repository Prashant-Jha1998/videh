/**
 * Catches unhandled promise rejections so they don't take down the JS runtime on some RN builds.
 */
export function installGlobalErrorHandlers(): void {
  const g = globalThis as typeof globalThis & {
    onunhandledrejection?: (event: PromiseRejectionEvent) => void;
    HermesInternal?: { enablePromiseRejectionTracker?: (opts: { allRejections: boolean }) => void };
  };

  if (typeof g.addEventListener === "function") {
    g.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      if (__DEV__) {
        console.warn("[Videh] Unhandled promise rejection:", event.reason);
      }
      event.preventDefault?.();
    });
  }

  if (__DEV__ && g.HermesInternal?.enablePromiseRejectionTracker) {
    try {
      g.HermesInternal.enablePromiseRejectionTracker({ allRejections: true });
    } catch {
      /* optional Hermes helper */
    }
  }
}
