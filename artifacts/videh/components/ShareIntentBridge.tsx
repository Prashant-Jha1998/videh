import { useRouter } from "expo-router";
import { useShareIntent } from "expo-share-intent";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useApp } from "@/context/AppContext";
import { stashIncomingShare, peekIncomingShare } from "@/lib/incomingSharePayload";

/** Routes Android/iOS share sheet opens into Videh chat picker. */
export function ShareIntentBridge() {
  const router = useRouter();
  const { isAuthenticated, isInitialized } = useApp();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    disabled: Platform.OS === "web",
  });
  const handlingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web" || !isInitialized || !isAuthenticated) return;
    void peekIncomingShare().then((pending) => {
      if (pending) router.push("/share-to-chat");
    });
  }, [isAuthenticated, isInitialized, router]);

  useEffect(() => {
    if (Platform.OS === "web" || !hasShareIntent || !shareIntent || handlingRef.current) return;
    handlingRef.current = true;
    void (async () => {
      try {
        await stashIncomingShare(shareIntent);
        resetShareIntent();
        if (isAuthenticated) {
          router.push("/share-to-chat");
        } else {
          router.replace("/auth/phone");
        }
      } finally {
        handlingRef.current = false;
      }
    })();
  }, [hasShareIntent, shareIntent, isAuthenticated, resetShareIntent, router]);

  return null;
}
