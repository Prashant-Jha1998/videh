import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import SplashAnimScreen from "./splash";
import { useApp } from "@/context/AppContext";

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isInitialized, user } = useApp();
  const [splashDone, setSplashDone] = useState(false);
  const routedRef = useRef(false);

  const handleSplashDone = () => {
    setSplashDone(true);
  };

  useEffect(() => {
    if (!splashDone || !isInitialized || routedRef.current) return;
    routedRef.current = true;
    if (isAuthenticated && user?.name) {
      router.replace("/(tabs)/chats");
    } else if (isAuthenticated && !user?.name) {
      router.replace("/auth/profile");
    } else {
      router.replace("/auth/phone");
    }
  }, [splashDone, isAuthenticated, isInitialized, user?.name, router]);

  return (
    <View style={styles.container}>
      <SplashAnimScreen onDone={handleSplashDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
