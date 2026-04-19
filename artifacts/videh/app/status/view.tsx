import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";

const { width: W } = Dimensions.get("window");
const BASE_URL = (() => {
  const d = process.env.EXPO_PUBLIC_DOMAIN;
  return d ? `https://${d}` : "";
})();

const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

export default function ViewStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { statuses, user } = useApp();
  const progress = useRef(new Animated.Value(0)).current;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const [paused, setPaused] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [reactionSummary, setReactionSummary] = useState<Record<string, number>>({});

  const status = statuses.find((s) => s.id === id);
  const isMyStatus = status?.userId === "me";
  const isMedia = status?.type === "image" || status?.type === "video";

  // Mark viewed + fetch my reaction on open
  useEffect(() => {
    if (!status || !user?.dbId) return;

    // Mark as viewed (only if not own)
    if (!isMyStatus) {
      fetch(`${BASE_URL}/api/statuses/${status.id}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerId: user.dbId }),
      }).catch(() => {});
    }

    // If own status, fetch viewers count + reactions
    if (isMyStatus) {
      fetch(`${BASE_URL}/api/statuses/${status.id}/viewers?ownerId=${user.dbId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setViewCount(data.viewCount ?? 0);
            setReactionSummary(data.reactions ?? {});
          }
        })
        .catch(() => {});
    }
  }, [status?.id]);

  // Auto-progress animation
  useEffect(() => {
    const duration = isMedia ? 8000 : 5000;
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (finished) router.back();
    });
    return () => anim.stop();
  }, []);

  const togglePause = () => {
    if (paused) {
      animRef.current?.start(({ finished }) => { if (finished) router.back(); });
    } else {
      animRef.current?.stop();
    }
    setPaused((p) => !p);
  };

  const sendReaction = async (emoji: string) => {
    if (!status || !user?.dbId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isSame = myReaction === emoji;
    setMyReaction(isSame ? null : emoji);
    setShowReactions(false);

    const endpoint = `${BASE_URL}/api/statuses/${status.id}/react`;
    if (isSame) {
      fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.dbId }),
      }).catch(() => {});
    } else {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.dbId, emoji }),
      }).catch(() => {});
    }
  };

  if (!status) return null;

  const userInitials = (status.userName ?? "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const totalReactions = Object.values(reactionSummary).reduce((a, b) => a + b, 0);

  return (
    <View style={[styles.container, {
      backgroundColor: isMedia ? "#000" : (status.backgroundColor ?? "#00A884"),
      paddingTop: topPad,
    }]}>
      {/* Progress bar */}
      <View style={styles.progressWrap}>
        <View style={styles.progressBg}>
          <Animated.View
            style={[styles.progressFill, {
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
            }]}
          />
        </View>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        {status.userAvatar ? (
          <Image source={{ uri: status.userAvatar }} style={styles.headerAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.headerAvatarFallback, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
            <Text style={styles.headerAvatarText}>{userInitials}</Text>
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{isMyStatus ? "My status" : status.userName}</Text>
          <Text style={styles.headerTime}>
            {new Date(status.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
        <TouchableOpacity onPress={togglePause} style={styles.iconBtn}>
          <Ionicons name={paused ? "play" : "pause"} size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowReactions(false)}>
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
      </TouchableOpacity>

      {/* ── BOTTOM SECTION ── */}
      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 12 }]}>

        {/* Reaction emoji picker (for others' status) */}
        {showReactions && !isMyStatus && (
          <View style={styles.reactionPicker}>
            {REACTIONS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={[styles.reactionBtn, myReaction === emoji && styles.reactionBtnActive]}
                onPress={() => sendReaction(emoji)}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Own status: Viewers info bar */}
        {isMyStatus ? (
          <TouchableOpacity
            style={styles.viewersBar}
            onPress={() => router.push({ pathname: "/status/viewers", params: { statusId: status.id } })}
            activeOpacity={0.8}
          >
            <View style={styles.viewersLeft}>
              <Ionicons name="eye-outline" size={20} color="rgba(255,255,255,0.9)" />
              <Text style={styles.viewersCount}>{viewCount}</Text>
            </View>

            {/* Reaction summary */}
            {totalReactions > 0 && (
              <View style={styles.reactionsSummary}>
                {Object.entries(reactionSummary).map(([emoji, count]) => (
                  <View key={emoji} style={styles.reactionChip}>
                    <Text style={styles.reactionChipEmoji}>{emoji}</Text>
                    <Text style={styles.reactionChipCount}>{count}</Text>
                  </View>
                ))}
              </View>
            )}

            <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        ) : (
          /* Others' status: reply + reaction */
          <View style={styles.replyRow}>
            <View style={[styles.replyBar, { flex: 1 }]}>
              <Ionicons name="happy-outline" size={22} color="rgba(255,255,255,0.7)" />
              <Text style={styles.replyPlaceholder}>Reply to {status.userName}...</Text>
            </View>
            <TouchableOpacity
              style={[styles.reactionToggle, myReaction ? styles.reactionToggleActive : {}]}
              onPress={() => {
                Haptics.selectionAsync();
                setShowReactions((v) => !v);
              }}
            >
              <Text style={styles.reactionToggleText}>{myReaction ?? "❤️"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressWrap: { paddingHorizontal: 8, paddingBottom: 4 },
  progressBg: { height: 3, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingVertical: 10, gap: 8 },
  iconBtn: { padding: 8 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarFallback: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  headerInfo: { flex: 1 },
  headerName: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerTime: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" },
  textWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  statusText: { color: "#fff", fontSize: 26, fontFamily: "Inter_600SemiBold", textAlign: "center", lineHeight: 36 },
  mediaWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  mediaImage: { width: W, height: "100%" },
  captionBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", padding: 12 },
  captionText: { color: "#fff", fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  // Bottom section
  bottomSection: { paddingHorizontal: 12, gap: 10 },
  // Reaction picker
  reactionPicker: { flexDirection: "row", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 40, paddingHorizontal: 8, paddingVertical: 8, gap: 4, alignSelf: "flex-end", marginRight: 4 },
  reactionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  reactionBtnActive: { backgroundColor: "rgba(255,255,255,0.2)", transform: [{ scale: 1.15 }] },
  reactionEmoji: { fontSize: 26 },
  // Reply row (others' status)
  replyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  replyBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderRadius: 50, paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  replyPlaceholder: { color: "rgba(255,255,255,0.7)", fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  reactionToggle: { width: 50, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  reactionToggleActive: { borderColor: "#fff", backgroundColor: "rgba(255,255,255,0.15)" },
  reactionToggleText: { fontSize: 24 },
  // Own status: viewers bar
  viewersBar: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  viewersLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  viewersCount: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  reactionsSummary: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  reactionChip: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
  reactionChipEmoji: { fontSize: 16 },
  reactionChipCount: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
