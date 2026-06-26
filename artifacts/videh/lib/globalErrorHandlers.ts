/**
 * Catches unhandled promise rejections and fatal JS errors so they are less likely
 * to take down the JS runtime on some RN builds.
 */
export function installGlobalErrorHandlers(): void {
  try {
    const g = globalThis as typeof globalThis & {
      onunhandledrejection?: (event: PromiseRejectionEvent) => void;
      HermesInternal?: { enablePromiseRejectionTracker?: (opts: { allRejections: boolean }) => void };
      ErrorUtils?: {
        getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
        setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
      };
    };

    if (typeof g.addEventListener === "function") {
      g.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
        console.warn("[Videh] Unhandled promise rejection:", event.reason);
        event.preventDefault?.();
      });
    }

    const errorUtils =
      g.ErrorUtils
      ?? (require("react-native") as { ErrorUtils?: typeof g.ErrorUtils }).ErrorUtils;

    const prevHandler = errorUtils?.getGlobalHandler?.();
    if (typeof errorUtils?.setGlobalHandler === "function") {
      errorUtils.setGlobalHandler((error, isFatal) => {
        console.error("[Videh] Global error:", error, isFatal ? "(fatal)" : "");
        prevHandler?.(error, isFatal);
      });
    }

    if (__DEV__ && g.HermesInternal?.enablePromiseRejectionTracker) {
      try {
        g.HermesInternal.enablePromiseRejectionTracker({ allRejections: true });
      } catch {
        /* optional Hermes helper */
      }
    }
  } catch (err) {
    console.warn("[Videh] installGlobalErrorHandlers failed:", err);
  }
}
