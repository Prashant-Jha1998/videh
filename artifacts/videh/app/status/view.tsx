import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";

const { width: W } = Dimensions.get("window");

export default function ViewStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { statuses } = useApp();
  const progress = useRef(new Animated.Value(0)).current;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const status = statuses.find((s) => s.id === id);

  useEffect(() => {
    const duration = status?.type === "image" || status?.type === "video" ? 8000 : 5000;
    Animated.timing(progress, { toValue: 1, duration, useNativeDriver: false }).start(({ finished }) => {
      if (finished) router.back();
    });
  }, []);

  if (!status) return null;

  const isMedia = status.type === "image" || status.type === "video";

  const userInitials = (status.userName ?? "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <View style={[styles.container, { backgroundColor: isMedia ? "#000" : (status.backgroundColor ?? "#00A884"), paddingTop: topPad, paddingBottom: insets.bottom + 20 }]}>
      {/* Progress bar */}
      <View style={styles.progressWrap}>
        <View style={styles.progressBg}>
          <Animated.View
            style={[styles.progressFill, {
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] })
            }]}
          />
        </View>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        {/* Avatar */}
        {status.userAvatar ? (
          <Image source={{ uri: status.userAvatar }} style={styles.headerAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.headerAvatarFallback, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
            <Text style={styles.headerAvatarText}>{userInitials}</Text>
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{status.userName}</Text>
          <Text style={styles.headerTime}>
            {new Date(status.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isMedia && status.mediaUrl ? (
        <View style={styles.mediaWrap}>
          <Image source={{ uri: status.mediaUrl }} style={styles.mediaImage} contentFit="contain" />
          {status.content && !(status.content === "📷 Photo" || status.content === "📹 Video") && (
            <View style={styles.captionBar}>
              <Text style={styles.captionText}>{status.content}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.textWrap}>
          <Text style={styles.statusText}>{status.content}</Text>
        </View>
      )}

      {/* Reply bar */}
      <View style={styles.replyBar}>
        <Ionicons name="happy-outline" size={22} color="rgba(255,255,255,0.7)" />
        <Text style={styles.replyPlaceholder}>Reply to {status.userName}...</Text>
        <TouchableOpacity>
          <Ionicons name="camera-outline" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressWrap: { paddingHorizontal: 8, paddingBottom: 4 },
  progressBg: { height: 3, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingVertical: 10, gap: 10 },
  iconBtn: { padding: 8 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarFallback: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  headerInfo: { flex: 1 },
  headerName: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerTime: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" },
  // Text status
  textWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  statusText: { color: "#fff", fontSize: 26, fontFamily: "Inter_600SemiBold", textAlign: "center", lineHeight: 36 },
  // Media status
  mediaWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  mediaImage: { width: W, height: "100%" },
  captionBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", padding: 12 },
  captionText: { color: "#fff", fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  // Reply
  replyBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderRadius: 50, marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  replyPlaceholder: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
});
