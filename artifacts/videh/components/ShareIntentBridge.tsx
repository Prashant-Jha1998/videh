import { useRouter, usePathname } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import {
  stashIncomingShareQuick,
  peekIncomingShare,
  payloadHasShareableContent,
  hasPendingIncomingShare,
  clearStaleIncomingShare,
  isShareFlowConsumed,
  isFreshIncomingShare,
} from "@/lib/incomingSharePayload";

/** Routes Android/iOS share sheet opens into Videh chat picker. */
export function ShareIntentBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const { isReady, hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  const handlingRef = useRef(false);
  const navigatedRef = useRef(false);

  const onSharePicker = pathname === "/share-to-chat" || pathname?.endsWith("/share-to-chat");

  const goToShareFlow = () => {
    if (navigatedRef.current || onSharePicker || isShareFlowConsumed()) return;
    navigatedRef.current = true;
    router.replace("/share-to-chat");
    setTimeout(() => {
      navigatedRef.current = false;
    }, 2000);
  };

  const tryNavigateToShare = async () => {
    if (onSharePicker || isShareFlowConsumed()) return;
    await clearStaleIncomingShare();
    const pending = await peekIncomingShare();
    if (pending && payloadHasShareableContent(pending) && isFreshIncomingShare(pending)) {
      goToShareFlow();
      return;
    }
    if (await hasPendingIncomingShare()) {
      goToShareFlow();
    }
  };

  useEffect(() => {
    if (Platform.OS === "web" || !isReady) return;
    void clearStaleIncomingShare();
  }, [isReady]);

  useEffect(() => {
    if (Platform.OS === "web" || !isReady) return;
    if (!hasShareIntent || !shareIntent || handlingRef.current) return;
    handlingRef.current = true;
    void (async () => {
      try {
        await stashIncomingShareQuick(shareIntent);
        resetShareIntent();
        goToShareFlow();
      } finally {
        handlingRef.current = false;
      }
    })();
  }, [hasShareIntent, shareIntent, isReady, resetShareIntent, onSharePicker]);

  useEffect(() => {
    if (Platform.OS === "web" || !isReady) return;
    if (hasShareIntent) {
      void tryNavigateToShare();
    }
  }, [hasShareIntent, isReady, onSharePicker]);

  // Cold start: share intent can arrive after first paint — poll until stashed or timeout.
  useEffect(() => {
    if (Platform.OS === "web" || !isReady) return;
    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 120 && !cancelled; i++) {
        if (onSharePicker || isShareFlowConsumed()) return;
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
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [isReady, hasShareIntent, shareIntent, resetShareIntent, onSharePicker]);

  useEffect(() => {
    if (error && __DEV__) {
      console.warn("[ShareIntentBridge]", error);
    }
  }, [error]);

  return null;
}
