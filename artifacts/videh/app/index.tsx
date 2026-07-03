import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useShareIntentContext } from "expo-share-intent";
import SplashAnimScreen from "./splash";
import { useApp } from "@/context/AppContext";
import {
  hasPendingIncomingShare,
  waitForPendingIncomingShare,
  clearStaleIncomingShare,
} from "@/lib/incomingSharePayload";

const SHARE_WAIT_MS = 18_000;
const ROUTE_FALLBACK_MS = 10_000;

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

  // Cold start: native share payload can arrive several seconds after first paint.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    void (async () => {
      if (isReady) await clearStaleIncomingShare();
      const pending = await waitForPendingIncomingShare(SHARE_WAIT_MS);
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

  const goSharePicker = () => {
    if (routedRef.current) return;
    routedRef.current = true;
    router.replace("/share-to-chat");
  };

  const goNormalHome = () => {
    if (routedRef.current) return;
    routedRef.current = true;
    if (isAuthenticated && user?.name) {
      router.replace("/(tabs)/chats");
    } else if (isAuthenticated && !user?.name) {
      router.replace("/auth/profile");
    } else {
      router.replace("/auth/phone");
    }
  };

  useEffect(() => {
    if (!splashDone) return;

    void (async () => {
      const pendingShare = shareLaunch
        || hasShareIntent
        || (await hasPendingIncomingShare());

      if (pendingShare) {
        goSharePicker();
        return;
      }

      if (!isInitialized) return;
      goNormalHome();
    })();
  }, [splashDone, shareLaunch, hasShareIntent, isAuthenticated, isInitialized, user?.name, router]);

  // Never leave the user on an infinite splash spinner.
  useEffect(() => {
    if (!splashDone) return;
    const timer = setTimeout(() => {
      if (routedRef.current) return;
      void (async () => {
        if (await hasPendingIncomingShare()) {
          goSharePicker();
          return;
        }
        if (isInitialized) {
          goNormalHome();
        }
      })();
    }, ROUTE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [splashDone, isInitialized, router]);

  if (splashDone) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#059669" />
        <Text style={styles.hint}>
          {shareLaunch || hasShareIntent ? "Opening share…" : "Loading…"}
        </Text>
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
  container: { flex: 1, backgroundColor: "#12101F", alignItems: "center", justifyContent: "center", gap: 12 },
  hint: { color: "rgba(255,255,255,0.55)", fontSize: 14, fontFamily: "Inter_500Medium" },
});
