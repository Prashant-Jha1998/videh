import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";

const { width: W, height: H } = Dimensions.get("window");

function VideoStatusPlayer({ uri, paused }: { uri: string; paused: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    if (!paused) p.play();
  });
  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused]);
  return (
    <VideoView
      player={player}
      style={{ width: W, height: H * 0.75 }}
      contentFit="contain"
      nativeControls={false}
    />
  );
}

const BASE_URL = getApiUrl();

const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

const MENU_ITEMS = [
  { label: "Message", icon: "chatbubble-outline" },
  { label: "Voice call", icon: "call-outline" },
  { label: "Video call", icon: "videocam-outline" },
  { label: "View contact", icon: "person-outline" },
  { label: "Get notifications", icon: "notifications-outline" },
  { label: "Hide", icon: "eye-off-outline" },
  { label: "Report", icon: "flag-outline" },
];

export default function ViewStatusScreen() {
  const params = useLocalSearchParams<{ ids?: string; id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { statuses, user, createDirectChat, sendMessage, markStatusViewedLocally } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const ids = params.ids
    ? params.ids.split(",").filter(Boolean)
    : params.id ? [params.id] : [];

  const initialIndex = params.id ? Math.max(0, ids.findIndex((x) => x === params.id)) : 0;
  const [currentIdx, setCurrentIdx] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [reactionSummary, setReactionSummary] = useState<Record<string, number>>({});
  const [reply, setReply] = useState("");

  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const pausedProgressRef = useRef(0);

  const currentStatus = statuses.find((s) => s.id === ids[currentIdx]);
  const isMyStatus = currentStatus?.userId === "me";
  const isMedia = currentStatus?.type === "image" || currentStatus?.type === "video";

  useEffect(() => {
    // Move status group to Viewed instantly when viewer opens.
    ids.forEach((id) => markStatusViewedLocally(id));
  }, [ids.join(","), markStatusViewedLocally]);

  // Mark viewed + fetch data when status changes
  useEffect(() => {
    if (!currentStatus || !user?.dbId) return;
    if (!isMyStatus) {
      markStatusViewedLocally(currentStatus.id);
      fetch(`${BASE_URL}/api/statuses/${currentStatus.id}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerId: user.dbId }),
      }).catch(() => {});
      // Reset reaction for new status
      setMyReaction(null);
      setShowReactions(false);
    }
    if (isMyStatus) {
      fetch(`${BASE_URL}/api/statuses/${currentStatus.id}/viewers?ownerId=${user.dbId}`)
        .then((r) => r.json())
        .then((data) => { if (data.success) { setViewCount(data.viewCount ?? 0); setReactionSummary(data.reactions ?? {}); } })
        .catch(() => {});
    }
  }, [currentStatus?.id, isMyStatus, user?.dbId, markStatusViewedLocally]);

  // Start progress animation
  const startAnim = useCallback((idx: number, fromValue = 0) => {
    progress.setValue(fromValue);
    const status = statuses.find((s) => s.id === ids[idx]);
    const duration = ((status?.type === "image" || status?.type === "video") ? 8000 : 5000) * (1 - fromValue);
    const anim = Animated.timing(progress, { toValue: 1, duration, useNativeDriver: false });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (!finished) return;
      if (idx < ids.length - 1) {
        setCurrentIdx(idx + 1);
      } else {
        router.back();
      }
    });
  }, [ids, statuses]);

  useEffect(() => {
    startAnim(currentIdx);
    return () => animRef.current?.stop();
  }, [currentIdx]);

  const goNext = () => {
    animRef.current?.stop();
    if (currentIdx < ids.length - 1) setCurrentIdx((i) => i + 1);
    else router.back();
  };

  const goPrev = () => {
    animRef.current?.stop();
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
    else startAnim(0);
  };

  const togglePause = () => {
    if (paused) {
      startAnim(currentIdx, pausedProgressRef.current);
      setPaused(false);
    } else {
      animRef.current?.stop();
      const listener = progress.addListener(({ value }) => { pausedProgressRef.current = value; });
      progress.removeAllListeners();
      setPaused(true);
    }
  };

  const sendReply = async () => {
    if (!currentStatus || !user?.dbId || !reply.trim()) return;
    try {
      const otherUserId = currentStatus.userId === "me"
        ? (user.dbId as number)
        : parseInt(currentStatus.userId, 10);
      const chatId = await createDirectChat(
        otherUserId,
        currentStatus.userName ?? "Contact",
        currentStatus.userAvatar
      );
      sendMessage(chatId, reply.trim());
      setReply("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sent!", `Your reply was sent to ${currentStatus.userName ?? "Contact"}.`);
    } catch {
      Alert.alert("Error", "Could not send reply.");
    }
  };

  const sendReaction = async (emoji: string) => {
    if (!currentStatus || !user?.dbId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isSame = myReaction === emoji;
    setMyReaction(isSame ? null : emoji);
    setShowReactions(false);
    const endpoint = `${BASE_URL}/api/statuses/${currentStatus.id}/react`;
    if (isSame) {
      fetch(endpoint, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.dbId }) }).catch(() => {});
    } else {
      fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.dbId, emoji }) }).catch(() => {});
    }
  };

  if (ids.length === 0 || !currentStatus) return null;

  const userInitials = (currentStatus.userName ?? "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const totalReactions = Object.values(reactionSummary).reduce((a, b) => a + b, 0);
  const bgColor = isMedia ? "#000" : (currentStatus.backgroundColor ?? "#00A884");

  return (
    <View style={[styles.container, { backgroundColor: bgColor, paddingTop: topPad }]}>

      {/* ── MULTIPLE PROGRESS BARS ── */}
      <View style={styles.barsWrap}>
        {ids.map((sid, i) => (
          <View key={sid} style={[styles.barBg, { flex: 1 }]}>
            {i < currentIdx ? (
              <View style={[styles.barFill, { width: "100%" }]} />
            ) : i === currentIdx ? (
              <Animated.View
                style={[styles.barFill, {
                  width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                }]}
              />
            ) : null}
          </View>
        ))}
      </View>

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        {currentStatus.userAvatar ? (
          <Image source={{ uri: currentStatus.userAvatar }} style={styles.headerAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.headerAvatarFb, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
            <Text style={styles.headerAvatarText}>{userInitials}</Text>
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{isMyStatus ? "My status" : currentStatus.userName}</Text>
          <Text style={styles.headerTime}>
            {new Date(currentStatus.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            {ids.length > 1 ? `  ·  ${currentIdx + 1}/${ids.length}` : ""}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => { setPaused((p) => { if (!p) animRef.current?.stop(); else startAnim(currentIdx, pausedProgressRef.current); return !p; }); }}>
          <Ionicons name={paused ? "play" : "pause"} size={17} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => { setShowMenu(true); animRef.current?.stop(); }}>
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── CONTENT ── (tap left = prev, tap right = next) */}
      <View style={{ flex: 1 }}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={(e) => {
            if (showReactions || showMenu) { setShowReactions(false); return; }
            const x = e.nativeEvent.locationX;
            if (x < W * 0.3) goPrev(); else goNext();
          }}
        >
          {isMedia && currentStatus.mediaUrl ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              {currentStatus.type === "video" ? (
                <VideoStatusPlayer uri={currentStatus.mediaUrl} paused={paused} />
              ) : (
                <Image source={{ uri: currentStatus.mediaUrl }} style={{ width: W, height: H * 0.75 }} contentFit="contain" />
              )}
              {currentStatus.content && currentStatus.content !== "📷 Photo" && currentStatus.content !== "📹 Video" && (
                <View style={styles.captionBar}>
                  <Text style={styles.captionText}>{currentStatus.content}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 }}>
              <Text style={styles.statusText}>{currentStatus.content}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── BOTTOM ── */}
      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 12 }]}>

        {/* Reaction picker (others' status) */}
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

        {isMyStatus ? (
          /* Own status: viewers bar */
          <TouchableOpacity
            style={styles.viewersBar}
            onPress={() => router.push({ pathname: "/status/viewers", params: { statusId: currentStatus.id } })}
            activeOpacity={0.8}
          >
            <View style={styles.viewersLeft}>
              <Ionicons name="eye-outline" size={20} color="rgba(255,255,255,0.9)" />
              <Text style={styles.viewersCount}>{viewCount}</Text>
            </View>
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
              <TextInput
                style={styles.replyInput}
                value={reply}
                onChangeText={setReply}
                placeholder={`Reply to ${currentStatus.userName}...`}
                placeholderTextColor="rgba(255,255,255,0.5)"
                onFocus={() => { animRef.current?.stop(); setPaused(true); }}
                onBlur={() => { if (paused) { startAnim(currentIdx, pausedProgressRef.current); setPaused(false); } }}
                returnKeyType="send"
                onSubmitEditing={sendReply}
              />
              {reply.length > 0 ? (
                <TouchableOpacity onPress={sendReply} style={styles.sendBtn}>
                  <Ionicons name="send" size={18} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.reactionToggle, myReaction ? styles.reactionToggleActive : {}]}
              onPress={() => { Haptics.selectionAsync(); setShowReactions((v) => !v); }}
            >
              <Text style={styles.reactionToggleText}>{myReaction ?? "❤️"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── 3-DOT MENU MODAL ── */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => { setShowMenu(false); startAnim(currentIdx, pausedProgressRef.current); }}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setShowMenu(false); startAnim(currentIdx, pausedProgressRef.current); }}
        >
          <View style={styles.menuCard}>
            {MENU_ITEMS.map((item, idx) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.menuItem, idx < MENU_ITEMS.length - 1 && styles.menuItemBorder]}
                onPress={() => {
                  setShowMenu(false);
                  startAnim(currentIdx, pausedProgressRef.current);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              >
                <Ionicons name={item.icon as any} size={20} color={item.label === "Report" ? "#e53e3e" : "#111b21"} />
                <Text style={[styles.menuItemText, item.label === "Report" && { color: "#e53e3e" }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Progress bars
  barsWrap: { flexDirection: "row", paddingHorizontal: 8, gap: 3, paddingBottom: 4 },
  barBg: { height: 2.5, backgroundColor: "rgba(255,255,255,0.35)", borderRadius: 2, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#fff", borderRadius: 2 },
  // Header
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingVertical: 8, gap: 8 },
  iconBtn: { padding: 8 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarFb: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerAvatarText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  headerInfo: { flex: 1 },
  headerName: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  headerTime: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontFamily: "Inter_400Regular" },
  // Content
  statusText: { color: "#fff", fontSize: 26, fontFamily: "Inter_600SemiBold", textAlign: "center", lineHeight: 36 },
  captionBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", padding: 12 },
  captionText: { color: "#fff", fontSize: 15, textAlign: "center" },
  // Bottom
  bottomSection: { paddingHorizontal: 12, gap: 10 },
  reactionPicker: { flexDirection: "row", justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 40, paddingHorizontal: 8, paddingVertical: 6, gap: 2, alignSelf: "flex-end" },
  reactionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  reactionBtnActive: { backgroundColor: "rgba(255,255,255,0.2)", transform: [{ scale: 1.15 }] },
  reactionEmoji: { fontSize: 25 },
  replyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  replyBar: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", borderRadius: 50, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  replyInput: { flex: 1, color: "#fff", fontSize: 14 },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#25D366", alignItems: "center", justifyContent: "center" },
  reactionToggle: { width: 50, height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  reactionToggleActive: { borderColor: "#fff", backgroundColor: "rgba(255,255,255,0.15)" },
  reactionToggleText: { fontSize: 24 },
  viewersBar: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  viewersLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  viewersCount: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  reactionsSummary: { flex: 1, flexDirection: "row", gap: 8, justifyContent: "center" },
  reactionChip: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
  reactionChipEmoji: { fontSize: 15 },
  reactionChipCount: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  // Menu modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  menuCard: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  menuItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  menuItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f0f2f5" },
  menuItemText: { fontSize: 16, color: "#111b21", fontFamily: "Inter_400Regular" },
});
