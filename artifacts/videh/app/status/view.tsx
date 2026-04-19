import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function ViewStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { statuses } = useApp();
  const colors = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false);

  const status = statuses.find((s) => s.id === id);
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 5000, useNativeDriver: false }).start(({ finished }) => {
      if (finished) { setDone(true); router.back(); }
    });
  }, []);

  if (!status) return null;

  return (
    <View style={[styles.container, { backgroundColor: status.backgroundColor ?? "#0B141A", paddingTop: topPad, paddingBottom: insets.bottom + 20 }]}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{status.userName}</Text>
          <Text style={styles.time}>{new Date(status.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</Text>
        </View>
        <TouchableOpacity style={styles.moreBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.statusText}>{status.content}</Text>
      </View>

      {/* Reply */}
      <View style={[styles.replyBar, { borderColor: "rgba(255,255,255,0.3)" }]}>
        <Ionicons name="happy-outline" size={22} color="rgba(255,255,255,0.7)" />
        <Text style={styles.replyPlaceholder}>Reply to {status.userName}...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressBar: { height: 3, backgroundColor: "rgba(255,255,255,0.3)", marginHorizontal: 8, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 12, gap: 12 },
  backBtn: { padding: 6 },
  headerInfo: { flex: 1 },
  name: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  time: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" },
  moreBtn: { padding: 6 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  statusText: { color: "#fff", fontSize: 26, fontFamily: "Inter_600SemiBold", textAlign: "center", lineHeight: 36 },
  replyBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 50, marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  replyPlaceholder: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
});
