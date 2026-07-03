import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useShareIntentContext } from "expo-share-intent";
import SplashAnimScreen from "./splash";
import { useApp } from "@/context/AppContext";
import {
  hasPendingIncomingShare,
  waitForPendingIncomingShare,
  clearStaleIncomingShare,
} from "@/lib/incomingSharePayload";
import { incomingShareRoute } from "@/lib/incomingShareRoute";

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isInitialized, user } = useApp();
  const { hasShareIntent, isReady } = useShareIntentContext();
  const [splashDone, setSplashDone] = useState(false);
  const [shareLaunch, setShareLaunch] = useState(false);
  const routedRef = useRef(false);

  const handleSplashDone = () => {
    setSplashDone(true);
  };

  // Share from another app: skip marketing splash immediately.
  useEffect(() => {
    if (hasShareIntent) {
      setShareLaunch(true);
      setSplashDone(true);
    }
  }, [hasShareIntent]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (isReady) await clearStaleIncomingShare();
      const pending = await waitForPendingIncomingShare(hasShareIntent ? 12_000 : 3_000);
      if (cancelled) return;
      if (pending || hasShareIntent) {
        setShareLaunch(true);
        setSplashDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasShareIntent, isReady]);

  useEffect(() => {
    if (!splashDone || routedRef.current) return;
    if (!isInitialized && !shareLaunch && !hasShareIntent) return;
    routedRef.current = true;
    void (async () => {
      if (shareLaunch || hasShareIntent || (await hasPendingIncomingShare())) {
        router.replace(incomingShareRoute(isAuthenticated));
        return;
      }
      if (!isInitialized) {
        routedRef.current = false;
        return;
      }
      if (isAuthenticated && user?.name) {
        router.replace("/(tabs)/chats");
      } else if (isAuthenticated && !user?.name) {
        router.replace("/auth/profile");
      } else {
        router.replace("/auth/phone");
      }
    })();
  }, [splashDone, shareLaunch, hasShareIntent, isAuthenticated, isInitialized, user?.name, router]);

  if (splashDone) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SplashAnimScreen onDone={handleSplashDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#12101F", alignItems: "center", justifyContent: "center" },
});
