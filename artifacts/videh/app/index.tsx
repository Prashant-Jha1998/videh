import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import SplashAnimScreen from "./splash";
import { useApp } from "@/context/AppContext";
import {
  hasPendingIncomingShare,
  waitForPendingIncomingShare,
} from "@/lib/incomingSharePayload";
import { incomingShareRoute } from "@/lib/incomingShareRoute";

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isInitialized, user } = useApp();
  const [splashDone, setSplashDone] = useState(false);
  const [shareLaunch, setShareLaunch] = useState(false);
  const routedRef = useRef(false);

  const handleSplashDone = () => {
    setSplashDone(true);
  };

  // Detect share-from-other-app launches and skip the marketing splash wait.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pending = await waitForPendingIncomingShare(8_000);
      if (cancelled) return;
      if (pending) {
        setShareLaunch(true);
        setSplashDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!splashDone || !isInitialized || routedRef.current) return;
    routedRef.current = true;
    void (async () => {
      if (shareLaunch || (await hasPendingIncomingShare())) {
        router.replace(incomingShareRoute(isAuthenticated));
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
  }, [splashDone, shareLaunch, isAuthenticated, isInitialized, user?.name, router]);

  if (splashDone) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#5B4FE8" />
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
