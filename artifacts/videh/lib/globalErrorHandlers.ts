import { ErrorUtils } from "react-native";

/**
 * Catches unhandled promise rejections and fatal JS errors so they are less likely
 * to take down the JS runtime on some RN builds.
 */
export function installGlobalErrorHandlers(): void {
  const g = globalThis as typeof globalThis & {
    onunhandledrejection?: (event: PromiseRejectionEvent) => void;
    HermesInternal?: { enablePromiseRejectionTracker?: (opts: { allRejections: boolean }) => void };
  };

  if (typeof g.addEventListener === "function") {
    g.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      console.warn("[Videh] Unhandled promise rejection:", event.reason);
      event.preventDefault?.();
    });
  }

  const prevHandler = ErrorUtils.getGlobalHandler?.();
  if (typeof ErrorUtils.setGlobalHandler === "function") {
    ErrorUtils.setGlobalHandler((error, isFatal) => {
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
}
