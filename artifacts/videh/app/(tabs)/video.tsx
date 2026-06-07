import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  RefreshControl,
  ScrollView,
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
  formatTimeAgo,
  formatViewCount,
  type ReelsFeedCursor,
  type ReelsVideo,
} from "@/lib/reelsApi";

const SCREEN_W = Dimensions.get("window").width;
const THUMB_H = Math.round((SCREEN_W * 9) / 16);
const TREND_W = Math.round(SCREEN_W * 0.72);
const TREND_H = Math.round((TREND_W * 9) / 16);

export default function VideoTabScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [trending, setTrending] = useState<ReelsVideo[]>([]);
  const [nextCursor, setNextCursor] = useState<ReelsFeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasChannel, setHasChannel] = useState<boolean | null>(null);
  const loadingMoreRef = useRef(false);

  const loadInitial = useCallback(async () => {
    if (!user?.dbId) return;
    const ch = await fetchMyReelsChannel(user.dbId, user.sessionToken);
    setHasChannel(Boolean(ch.channel));
    const feed = await fetchReelsFeed(user.dbId, null, user.sessionToken);
    setVideos(feed.videos ?? []);
    setTrending(feed.trending ?? []);
    setNextCursor(feed.nextCursor ?? null);
    setLoading(false);
  }, [user?.dbId, user?.sessionToken]);

  const loadMore = useCallback(async () => {
    if (!user?.dbId || !nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const feed = await fetchReelsFeed(user.dbId, nextCursor, user.sessionToken);
      const incoming = feed.videos ?? [];
      if (incoming.length > 0) {
        setVideos((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          return [...prev, ...incoming.filter((v) => !seen.has(v.id))];
        });
      }
      setNextCursor(feed.nextCursor ?? null);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [user?.dbId, user?.sessionToken, nextCursor]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadInitial();
    }, [loadInitial]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitial();
    setRefreshing(false);
  };

  const openVideo = (v: ReelsVideo) => {
    router.push({ pathname: "/reels/watch/[id]", params: { id: String(v.id) } });
  };

  const channelLabel = (v: ReelsVideo) =>
    v.channelDisplayName ?? (v.channelHandle ? `@${v.channelHandle}` : "Channel");

  const renderVideoCard = (item: ReelsVideo, compact = false) => (
    <TouchableOpacity
      style={compact ? styles.trendCard : styles.ytCard}
      onPress={() => openVideo(item)}
      activeOpacity={0.9}
    >
      <View style={styles.thumbWrap}>
        {item.thumbnailUrl ? (
          <Image
            source={{ uri: item.thumbnailUrl }}
            style={compact ? styles.trendThumb : styles.thumb}
            contentFit="cover"
            recyclingKey={`thumb-${item.id}`}
            cacheKey={`thumb-${item.id}-${item.thumbnailUrl}`}
          />
        ) : (
          <View
            style={[
              compact ? styles.trendThumb : styles.thumb,
              styles.thumbPlaceholder,
              { backgroundColor: colors.muted },
            ]}
          >
            <Ionicons name="videocam" size={compact ? 28 : 40} color={colors.mutedForeground} />
          </View>
        )}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
        </View>
      </View>

      <View style={compact ? styles.trendInfo : styles.infoRow}>
        {!compact && (
          <TouchableOpacity
            onPress={() => item.channelHandle && router.push({ pathname: "/reels/channel/[handle]", params: { handle: item.channelHandle } })}
          >
            {item.channelAvatarUrl ? (
              <Image
                source={{ uri: item.channelAvatarUrl }}
                style={styles.channelAvatar}
                contentFit="cover"
                cacheKey={`ch-avatar-${item.channelId}-${item.channelAvatarUrl}`}
              />
            ) : (
              <View style={[styles.channelAvatar, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ color: "#fff", fontFamily: "Inter_700Bold" }}>{(item.channelHandle ?? "?")[0]?.toUpperCase()}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        <View style={styles.infoText}>
          <Text style={[styles.ytTitle, { color: colors.foreground }]} numberOfLines={compact ? 2 : 2}>{item.title}</Text>
          <Text style={[styles.ytMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {channelLabel(item)} · {formatViewCount(item.viewCount)} views
            {item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: ReelsVideo }) => renderVideoCard(item);

  const listHeader = (
    <>
      {hasChannel === false ? (
        <TouchableOpacity
          style={[styles.setupBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/reels/setup")}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.foreground }]}>Create your channel</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              Upload videos of any length and grow subscribers
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      ) : null}

      {trending.length > 0 ? (
        <View style={styles.trendingSection}>
          <View style={styles.sectionHead}>
            <Ionicons name="flame" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trending</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendScroll}>
            {trending.map((v) => (
              <View key={`trend-${v.id}`}>{renderVideoCard(v, true)}</View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.sectionHead}>
        <Ionicons name="time-outline" size={18} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Latest</Text>
      </View>
    </>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
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
            onPress={() => {
              if (hasChannel) {
                router.push({ pathname: "/reels/channel/[handle]", params: { handle: "me" } });
              } else {
                router.push("/reels/setup");
              }
            }}
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
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ color: colors.mutedForeground }}>No videos yet. Be the first to post!</Text>
          </View>
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.mutedForeground, marginTop: 8, fontSize: 12 }}>Loading more videos…</Text>
            </View>
          ) : nextCursor ? (
            <View style={styles.footerLoader}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Scroll for more</Text>
            </View>
          ) : videos.length > 0 ? (
            <View style={styles.footerLoader}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>You're all caught up for now</Text>
            </View>
          ) : null
        }
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 72 }]}
        onPress={() => (hasChannel ? router.push("/reels/upload") : router.push("/reels/setup"))}
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
  setupBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    margin: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  trendingSection: { marginBottom: 8 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, marginTop: 8, marginBottom: 8 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  trendScroll: { paddingHorizontal: 12, gap: 12 },
  trendCard: { width: TREND_W, marginRight: 12 },
  trendThumb: { width: TREND_W, height: TREND_H, borderRadius: 10 },
  trendInfo: { paddingTop: 8 },
  ytCard: { marginBottom: 16 },
  thumbWrap: { position: "relative" },
  thumb: { width: SCREEN_W, height: THUMB_H },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  durationBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  infoRow: { flexDirection: "row", paddingHorizontal: 12, paddingTop: 10, gap: 10, alignItems: "flex-start" },
  channelAvatar: { width: 36, height: 36, borderRadius: 18 },
  infoText: { flex: 1 },
  ytTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  ytMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  footerLoader: { alignItems: "center", paddingVertical: 20 },
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
});
