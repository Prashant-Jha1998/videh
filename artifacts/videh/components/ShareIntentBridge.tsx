import { useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useApp } from "@/context/AppContext";
import {
  stashIncomingShareQuick,
  peekIncomingShare,
  payloadHasShareableContent,
  hasPendingIncomingShare,
} from "@/lib/incomingSharePayload";
import { incomingShareRoute } from "@/lib/incomingShareRoute";

/** Routes Android/iOS share sheet opens into Videh chat picker. */
export function ShareIntentBridge() {
  const router = useRouter();
  const { isAuthenticated, isInitialized } = useApp();
  const { isReady, hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  const handlingRef = useRef(false);
  const navigatedRef = useRef(false);

  const goToShareFlow = () => {
    if (navigatedRef.current || !isInitialized) return;
    navigatedRef.current = true;
    router.replace(incomingShareRoute(isAuthenticated));
    setTimeout(() => {
      navigatedRef.current = false;
    }, 2500);
  };

  const tryNavigateToShare = async () => {
    if (!isInitialized) return;
    const pending = await peekIncomingShare();
    if (pending && payloadHasShareableContent(pending)) {
      goToShareFlow();
    }
  };

  useEffect(() => {
    if (Platform.OS === "web" || !isReady) return;
    if (!hasShareIntent || !shareIntent || handlingRef.current) return;
    handlingRef.current = true;
    void (async () => {
      try {
        await stashIncomingShareQuick(shareIntent);
        resetShareIntent();
        await tryNavigateToShare();
      } finally {
        handlingRef.current = false;
      }
    })();
  }, [hasShareIntent, shareIntent, isAuthenticated, isInitialized, isReady, resetShareIntent]);

  useEffect(() => {
    if (Platform.OS === "web" || !isInitialized) return;
    void tryNavigateToShare();
  }, [isAuthenticated, isInitialized]);

  // Cold start: share intent can arrive after first paint — keep checking briefly.
  useEffect(() => {
    if (Platform.OS === "web" || !isReady) return;
    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 40 && !cancelled; i++) {
        if (await hasPendingIncomingShare()) {
          goToShareFlow();
          return;
        }
        if (hasShareIntent && shareIntent && !handlingRef.current) {
          handlingRef.current = true;
          try {
            await stashIncomingShareQuick(shareIntent);
            resetShareIntent();
            goToShareFlow();
            return;
          } finally {
            handlingRef.current = false;
          }
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [isReady, isInitialized, isAuthenticated, hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    if (error && __DEV__) {
      console.warn("[ShareIntentBridge]", error);
    }
  }, [error]);

  return null;
}
