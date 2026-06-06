import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  fetchMyReelsChannel,
  fetchReelsFeed,
  formatDuration,
  formatViewCount,
  type ReelsVideo,
} from "@/lib/reelsApi";

export default function VideoTabScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasChannel, setHasChannel] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!user?.dbId) return;
    const ch = await fetchMyReelsChannel(user.dbId, user.sessionToken);
    setHasChannel(Boolean(ch.channel));
    if (!ch.channel) {
      setVideos([]);
      setLoading(false);
      return;
    }
    const feed = await fetchReelsFeed(user.dbId, undefined, user.sessionToken);
    setVideos(feed.videos ?? []);
    setLoading(false);
  }, [user?.dbId, user?.sessionToken]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openVideo = (v: ReelsVideo) => {
    router.push({ pathname: "/reels/watch/[id]", params: { id: String(v.id) } });
  };

  const renderItem = ({ item }: { item: ReelsVideo }) => (
    <TouchableOpacity style={styles.card} onPress={() => openVideo(item)} activeOpacity={0.85}>
      <View style={styles.thumbWrap}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: colors.muted }]}>
            <Ionicons name="videocam" size={32} color={colors.mutedForeground} />
          </View>
        )}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
          @{item.channelHandle ?? "channel"} · {formatViewCount(item.viewCount)} views
        </Text>
        <Text style={[styles.stats, { color: colors.mutedForeground }]}>
          👍 {item.likeCount} · 💬 {item.commentCount} · 👎 {item.dislikeCount}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (hasChannel === false) {
    return (
      <View style={[styles.setupWrap, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
        <Ionicons name="logo-youtube" size={56} color={colors.primary} />
        <Text style={[styles.setupTitle, { color: colors.foreground }]}>Set up your Video channel</Text>
        <Text style={[styles.setupSub, { color: colors.mutedForeground }]}>
          Create your @username, post videos up to 5 minutes, and grow subscribers.
        </Text>
        <TouchableOpacity
          style={[styles.setupBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push("/reels/setup")}
        >
          <Text style={styles.setupBtnText}>Create channel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.headerBg ?? colors.primary }]}>
        <Text style={styles.headerTitle}>Video</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push("/reels/search")} style={styles.iconBtn}>
            <Ionicons name="search" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => user?.dbId && router.push({ pathname: "/reels/channel/[handle]", params: { handle: "me" } })}
            style={styles.iconBtn}
          >
            <Ionicons name="person-circle-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={videos}
        keyExtractor={(v) => String(v.id)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 8 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: colors.mutedForeground }}>No videos yet. Be the first to post!</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 72 }]}
        onPress={() => router.push("/reels/upload")}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  headerActions: { flexDirection: "row", gap: 4 },
  iconBtn: { padding: 8 },
  card: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10, gap: 12 },
  thumbWrap: { position: "relative" },
  thumb: { width: 140, height: 78, borderRadius: 8 },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  durationBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: { color: "#fff", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cardBody: { flex: 1, justifyContent: "center" },
  title: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  stats: { fontSize: 11, marginTop: 4 },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  setupWrap: { flex: 1, alignItems: "center", paddingHorizontal: 28 },
  setupTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 20, textAlign: "center" },
  setupSub: { fontSize: 14, textAlign: "center", lineHeight: 20, marginTop: 10, marginBottom: 28 },
  setupBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28 },
  setupBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
