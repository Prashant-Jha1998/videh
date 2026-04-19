import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import SplashAnimScreen from "./splash";
import { useApp } from "@/context/AppContext";

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, user } = useApp();
  const [splashDone, setSplashDone] = useState(false);

  const handleSplashDone = () => {
    setSplashDone(true);
  };

  useEffect(() => {
    if (!splashDone) return;
    if (isAuthenticated && user?.name) {
      router.replace("/(tabs)/chats");
    } else if (isAuthenticated && !user?.name) {
      router.replace("/auth/profile");
    } else {
      router.replace("/auth/phone");
    }
  }, [splashDone, isAuthenticated, user?.name]);

  return (
    <View style={styles.container}>
      <SplashAnimScreen onDone={handleSplashDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
