import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ReelsFeedAdCard } from "@/components/ReelsFeedAdCard";
import {
  fetchMyReelsChannel,
  fetchReelsFeed,
  formatDuration,
  formatTimeAgo,
  formatViewCount,
  type ReelsChannel,
  type ReelsFeedAdPlacement,
  type ReelsFeedCursor,
  type ReelsVideo,
} from "@/lib/reelsApi";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";
import { headerTopInset } from "@/lib/headerInset";
import { loadReelsFeedCache, saveReelsFeedCache } from "@/lib/reelsFeedCache";

type FeedRow =
  | { kind: "video"; key: string; video: ReelsVideo }
  | { kind: "ad"; key: string; ad: ReelsFeedAdPlacement["ad"] };

function buildFeedRows(videos: ReelsVideo[], placements: ReelsFeedAdPlacement[]): FeedRow[] {
  const adAfter = new Map<number, ReelsFeedAdPlacement["ad"]>();
  for (const p of placements) {
    adAfter.set(p.insertAfterIndex, p.ad);
  }
  const rows: FeedRow[] = [];
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    rows.push({ kind: "video", key: `v-${v.id}`, video: v });
    const ad = adAfter.get(i);
    if (ad) rows.push({ kind: "ad", key: `ad-${ad.id}-${i}`, ad });
  }
  return rows;
}

const SCREEN_W = Dimensions.get("window").width;
const THUMB_H = Math.round((SCREEN_W * 9) / 16);
const TREND_W = Math.round(SCREEN_W * 0.72);
const TREND_H = Math.round((TREND_W * 9) / 16);

function VideoThumb({
  uri,
  videoId,
  compact,
  placeholderColor,
  iconColor,
}: {
  uri: string | null | undefined;
  videoId: number;
  compact?: boolean;
  placeholderColor: string;
  iconColor: string;
}) {
  const [failed, setFailed] = useState(false);
  const style = compact ? styles.trendThumb : styles.thumb;
  if (!uri || failed) {
    return (
      <View style={[style, styles.thumbPlaceholder, { backgroundColor: placeholderColor }]}>
        <Ionicons name="videocam" size={compact ? 28 : 40} color={iconColor} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="cover"
      recyclingKey={`thumb-${videoId}`}
      onError={() => setFailed(true)}
    />
  );
}

function VideoFeedSkeleton({ mutedColor, softColor }: { mutedColor: string; softColor: string }) {
  return (
    <View style={styles.skeletonWrap}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <View style={[styles.thumb, { backgroundColor: mutedColor }]} />
          <View style={styles.infoRow}>
            <View style={[styles.skeletonAvatar, { backgroundColor: mutedColor }]} />
            <View style={styles.skeletonLines}>
              <View style={[styles.skeletonLine, { backgroundColor: mutedColor, width: "88%" }]} />
              <View style={[styles.skeletonLine, { backgroundColor: softColor, width: "55%" }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function ChannelAvatar({
  uri,
  channelId,
  label,
  size,
  primaryColor,
}: {
  uri: string | null | undefined;
  channelId: number;
  label: string;
  size: number;
  primaryColor: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (label.replace(/^@/, "")[0] ?? "?").toUpperCase();
  if (!uri || failed) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: primaryColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: size * 0.42 }}>{initial}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      recyclingKey={`ch-${channelId}`}
      onError={() => setFailed(true)}
    />
  );
}

export default function VideoTabScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [adPlacements, setAdPlacements] = useState<ReelsFeedAdPlacement[]>([]);
  const videoCountRef = useRef(0);
  const [trending, setTrending] = useState<ReelsVideo[]>([]);
  const [nextCursor, setNextCursor] = useState<ReelsFeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasChannel, setHasChannel] = useState<boolean | null>(null);
  const [myChannel, setMyChannel] = useState<ReelsChannel | null>(null);
  const loadingMoreRef = useRef(false);
  const loadedOnceRef = useRef(false);

  const applyFeed = useCallback((feed: {
    videos?: ReelsVideo[];
    trending?: ReelsVideo[];
    feedAdPlacements?: ReelsFeedAdPlacement[];
    nextCursor?: ReelsFeedCursor | null;
  }) => {
    setVideos(feed.videos ?? []);
    setAdPlacements(feed.feedAdPlacements ?? []);
    setTrending(feed.trending ?? []);
    setNextCursor(feed.nextCursor ?? null);
  }, []);

  const loadInitial = useCallback(async (opts?: { silent?: boolean }) => {
    const uid = user?.dbId;
    if (!uid) {
      setLoading(false);
      return;
    }

    const showBlockingLoader = !opts?.silent && !loadedOnceRef.current;
    if (showBlockingLoader) {
      const cached = await loadReelsFeedCache(uid);
      if (cached?.videos?.length) {
        applyFeed({
          videos: cached.videos,
          trending: cached.trending,
          feedAdPlacements: cached.adPlacements,
          nextCursor: cached.nextCursor,
        });
        loadedOnceRef.current = true;
        setLoading(false);
      } else {
        setLoading(true);
      }
    }

    const feedPromise = fetchReelsFeed(uid, null, user.sessionToken);
    const channelPromise = fetchMyReelsChannel(uid, user.sessionToken, { summary: true });

    try {
      const feed = await feedPromise;
      applyFeed(feed);
      loadedOnceRef.current = true;
      setLoading(false);
      if ((feed.videos ?? []).length > 0) {
        void saveReelsFeedCache(uid, {
          videos: feed.videos ?? [],
          trending: feed.trending,
          adPlacements: feed.feedAdPlacements,
          nextCursor: feed.nextCursor,
        });
      }

      const ch = await channelPromise;
      setMyChannel(ch.channel ?? null);
      setHasChannel(Boolean(ch.channel));
    } catch {
      setLoading(false);
    }
  }, [user?.dbId, user?.sessionToken, applyFeed]);

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
      const batchPlacements = feed.feedAdPlacements ?? [];
      if (batchPlacements.length > 0) {
        const offset = videoCountRef.current;
        setAdPlacements((prev) => [
          ...prev,
          ...batchPlacements.map((p) => ({
            insertAfterIndex: offset + p.insertAfterIndex,
            ad: p.ad,
          })),
        ]);
      }
      setNextCursor(feed.nextCursor ?? null);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [user?.dbId, user?.sessionToken, nextCursor]);

  useFocusEffect(
    useCallback(() => {
      void loadInitial({ silent: loadedOnceRef.current });
    }, [loadInitial]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitial({ silent: true });
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
        <VideoThumb
          uri={item.thumbnailUrl}
          videoId={item.id}
          compact={compact}
          placeholderColor={colors.muted}
          iconColor={colors.mutedForeground}
        />
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
        </View>
      </View>

      <View style={compact ? styles.trendInfo : styles.infoRow}>
        <TouchableOpacity
          onPress={() => item.channelHandle && router.push({ pathname: "/reels/channel/[handle]", params: { handle: item.channelHandle } })}
        >
          <ChannelAvatar
            uri={item.channelAvatarUrl}
            channelId={item.channelId}
            label={channelLabel(item)}
            size={compact ? 28 : 36}
            primaryColor={colors.primary}
          />
        </TouchableOpacity>
        <View style={[styles.infoText, compact ? { flex: 1 } : undefined]}>
          <Text style={[styles.ytTitle, { color: colors.foreground }]} numberOfLines={compact ? 2 : 2}>{item.title}</Text>
          <Text style={[styles.ytMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {channelLabel(item)} · {formatViewCount(item.viewCount)} views
            {item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  useEffect(() => {
    videoCountRef.current = videos.length;
  }, [videos.length]);

  const feedRows = useMemo(
    () => buildFeedRows(videos, adPlacements),
    [videos, adPlacements],
  );

  const renderItem = ({ item }: { item: FeedRow }) =>
    item.kind === "ad" ? <ReelsFeedAdCard ad={item.ad} /> : renderVideoCard(item.video);

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

  const headerBar = (
    <View style={[styles.header, { paddingTop: headerTopInset(insets) + 8, backgroundColor: colors.headerBg ?? colors.primary }]}>
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
          style={styles.headerAvatarBtn}
        >
          {myChannel?.avatarUrl ? (
            <Image
              source={{ uri: myChannel.avatarUrl }}
              style={styles.headerAvatar}
              contentFit="cover"
            />
          ) : user?.avatar ? (
            <Image
              source={{ uri: resolvePublicAssetUrl(user.avatar) ?? user.avatar }}
              style={styles.headerAvatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarFallback, { backgroundColor: "rgba(255,255,255,0.25)" }]}>
              <Text style={styles.headerAvatarInitial}>
                {(myChannel?.displayName ?? user?.name ?? "?")[0]?.toUpperCase()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading && videos.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {headerBar}
        <VideoFeedSkeleton
          mutedColor={colors.muted}
          softColor={colors.border ?? colors.muted}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {headerBar}

      <FlatList
        data={feedRows}
        keyExtractor={(row) => row.key}
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
  headerAvatarBtn: { padding: 4 },
  headerAvatar: { width: 32, height: 32, borderRadius: 16 },
  headerAvatarFallback: { alignItems: "center", justifyContent: "center" },
  headerAvatarInitial: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
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
  trendInfo: { flexDirection: "row", paddingTop: 8, gap: 8, alignItems: "flex-start" },
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
  skeletonWrap: { paddingBottom: 24 },
  skeletonCard: { marginBottom: 16 },
  skeletonAvatar: { width: 36, height: 36, borderRadius: 18 },
  skeletonLines: { flex: 1, gap: 8, paddingTop: 2 },
  skeletonLine: { height: 12, borderRadius: 6 },
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
