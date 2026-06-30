import { useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useApp } from "@/context/AppContext";
import {
  stashIncomingShare,
  peekIncomingShare,
  payloadHasShareableContent,
} from "@/lib/incomingSharePayload";

/** Routes Android/iOS share sheet opens into Videh chat picker. */
export function ShareIntentBridge() {
  const router = useRouter();
  const { isAuthenticated, isInitialized } = useApp();
  const { isReady, hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  const handlingRef = useRef(false);
  const navigatedRef = useRef(false);

  const goToSharePicker = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.push("/share-to-chat");
    setTimeout(() => {
      navigatedRef.current = false;
    }, 1500);
  };

  useEffect(() => {
    if (Platform.OS === "web" || !isInitialized || !isAuthenticated) return;
    void peekIncomingShare().then((pending) => {
      if (pending && payloadHasShareableContent(pending)) goToSharePicker();
    });
  }, [isAuthenticated, isInitialized, router]);

  useEffect(() => {
    if (Platform.OS === "web" || !isReady || !isInitialized) return;
    if (!hasShareIntent || !shareIntent || handlingRef.current) return;
    handlingRef.current = true;
    void (async () => {
      try {
        await stashIncomingShare(shareIntent);
        resetShareIntent();
        const pending = await peekIncomingShare();
        if (!pending || !payloadHasShareableContent(pending)) return;
        if (isAuthenticated) {
          goToSharePicker();
        } else {
          router.replace("/auth/phone");
        }
      } finally {
        handlingRef.current = false;
      }
    })();
  }, [hasShareIntent, shareIntent, isAuthenticated, isInitialized, isReady, resetShareIntent, router]);

  useEffect(() => {
    if (error && __DEV__) {
      console.warn("[ShareIntentBridge]", error);
    }
  }, [error]);

  return null;
}
