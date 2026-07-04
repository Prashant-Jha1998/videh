import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReelsCommentsSheet } from "@/components/ReelsCommentsSheet";
import { VibeAdCard } from "@/components/VibeAdCard";
import { VibeDetailsSheet } from "@/components/VibeDetailsSheet";
import { VibeInlinePlayer } from "@/components/VibeInlinePlayer";
import { useColors } from "@/hooks/useColors";
import {
  formatViewCount,
  reactReelsVideo,
  subscribeReelsChannel,
  unsubscribeReelsChannel,
  type ReelsVideo,
  type ReelsVibeAdPlacement,
} from "@/lib/reelsApi";
import { shareReelsVideoLink } from "@/lib/reelsShare";
import type { VideoEditorMetadata } from "@/lib/videoEditor";
import { VIBE_BRAND_NAME } from "@/lib/vibeVideo";
import { useApp } from "@/context/AppContext";

const SCREEN_H = Dimensions.get("window").height;
const SCREEN_W = Dimensions.get("window").width;
const TAB_BAR_H = Platform.OS === "ios" ? 49 : 56;

type Props = {
  videos: ReelsVideo[];
  adPlacements?: ReelsVibeAdPlacement[];
  onLoadMore?: () => void;
  loadingMore?: boolean;
  onUpload?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<void>;
  onReport?: (video: ReelsVideo) => void;
};

type VibeRow =
  | { kind: "video"; key: string; video: ReelsVideo }
  | { kind: "ad"; key: string; ad: ReelsVibeAdPlacement["ad"] };

function buildVibeRows(videos: ReelsVideo[], placements: ReelsVibeAdPlacement[]): VibeRow[] {
  const adAfter = new Map<number, ReelsVibeAdPlacement["ad"]>();
  for (const p of placements) {
    adAfter.set(p.insertAfterIndex, p.ad);
  }
  const rows: VibeRow[] = [];
  for (let i = 0; i < videos.length; i++) {
    rows.push({ kind: "video", key: `vibe-v-${videos[i].id}`, video: videos[i] });
    const ad = adAfter.get(i);
    if (ad) rows.push({ kind: "ad", key: `vibe-ad-${ad.id}-${i}`, ad });
  }
  return rows;
}

function parseEditorMeta(raw: ReelsVideo["editorMetadata"]): VideoEditorMetadata | null {
  let src: unknown = raw;
  if (typeof raw === "string") {
    try {
      src = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!src || typeof src !== "object") return null;
  const obj = src as Record<string, unknown>;
  return {
    filter: (obj.filter as VideoEditorMetadata["filter"]) ?? "none",
    caption: String(obj.caption ?? ""),
    textOverlays: Array.isArray(obj.textOverlays)
      ? (obj.textOverlays as Array<Record<string, unknown>>).map((t) => ({
        id: String(t.id ?? Math.random().toString(36).slice(2)),
        text: String(t.text ?? ""),
        x: Number(t.x ?? 0.1),
        y: Number(t.y ?? 0.1),
        color: String(t.color ?? "#FFFFFF"),
        fontSize: Number(t.fontSize ?? 22),
      }))
      : [],
  };
}

function formatActionCount(n: number): string {
  return formatViewCount(Math.max(0, n));
}

function VibeCard({
  item,
  height,
  bottomChrome,
  isActive,
  liked,
  subscribed,
  commentsOpen,
  detailsOpen,
  userId,
  sessionToken,
  onLike,
  onComment,
  onShare,
  onMore,
  onReport,
  onFollow,
  onOpenChannel,
}: {
  item: ReelsVideo;
  height: number;
  bottomChrome: number;
  isActive: boolean;
  liked: boolean;
  subscribed: boolean;
  commentsOpen: boolean;
  detailsOpen: boolean;
  userId?: number;
  sessionToken?: string | null;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onMore: () => void;
  onReport?: () => void;
  onFollow: () => void;
  onOpenChannel: () => void;
}) {
  const colors = useColors();
  const channel = item.channelDisplayName ?? (item.channelHandle ? `@${item.channelHandle}` : "Channel");
  const handle = item.channelHandle ? `@${item.channelHandle}` : channel;
  const editorMeta = parseEditorMeta(item.editorMetadata);
  const canPlay = Boolean(item.videoUrl && item.videoUrl.trim().length > 0);
  const likeCount = item.likeCount + (liked && item.myReaction !== "like" ? 1 : 0);
  const caption = editorMeta?.caption?.trim() || item.title;

  return (
    <View style={[styles.card, { height, backgroundColor: "#000" }]}>
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="contain" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted }]} />
      )}

      {isActive && canPlay ? (
        <VibeInlinePlayer
          videoId={item.id}
          videoUrl={item.videoUrl}
          durationSeconds={item.durationSeconds}
          userId={userId}
          sessionToken={sessionToken}
          isActive
          playbackSuppressed={commentsOpen || detailsOpen}
          posterUrl={item.thumbnailUrl}
          editorMetadata={editorMeta}
        />
      ) : null}

      {!isActive ? <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" /> : null}

      <LinearGradient
        colors={["rgba(0,0,0,0.45)", "transparent"]}
        style={styles.topGradient}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.72)"]}
        style={[styles.bottomGradient, { height: bottomChrome + 200 }]}
        pointerEvents="none"
      />

      <View style={[styles.sideActions, { bottom: bottomChrome + 8 }]}>
        <TouchableOpacity style={styles.sideBtn} onPress={onLike} hitSlop={8}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={30} color={liked ? "#FF3040" : "#fff"} />
          <Text style={styles.sideLabel}>{formatActionCount(likeCount)}</Text>
        </TouchableOpacity>
        {item.commentsEnabled !== false ? (
          <TouchableOpacity style={styles.sideBtn} onPress={onComment} hitSlop={8}>
            <Ionicons name="chatbubble-outline" size={28} color="#fff" />
            <Text style={styles.sideLabel}>{formatActionCount(item.commentCount)}</Text>
          </TouchableOpacity>
        ) : null}
        {item.sharesEnabled !== false ? (
          <TouchableOpacity style={styles.sideBtn} onPress={onShare} hitSlop={8}>
            <Ionicons name="paper-plane-outline" size={27} color="#fff" />
            <Text style={styles.sideLabel}>{formatActionCount(item.shareCount ?? 0)}</Text>
          </TouchableOpacity>
        ) : null}
        {onReport ? (
          <TouchableOpacity style={styles.sideBtn} onPress={onReport} hitSlop={8}>
            <Ionicons name="flag-outline" size={26} color="#fff" />
            <Text style={styles.sideLabel}>Report</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.sideBtn} onPress={onMore} hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.bottomMeta, { paddingBottom: bottomChrome + 8 }]}>
        <View style={styles.authorRow}>
          <TouchableOpacity style={styles.authorTap} onPress={onOpenChannel} activeOpacity={0.85}>
            {item.channelAvatarUrl ? (
              <Image source={{ uri: item.channelAvatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={16} color="#fff" />
              </View>
            )}
            <Text style={styles.handle} numberOfLines={1}>{handle}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.followBtn, subscribed && styles.followBtnDone]}
            onPress={onFollow}
            hitSlop={6}
          >
            <Text style={[styles.followText, subscribed && styles.followTextDone]}>
              {subscribed ? "Connected" : "Connect"}
            </Text>
          </TouchableOpacity>
        </View>

        {caption ? (
          <TouchableOpacity activeOpacity={0.9} onPress={onMore}>
            <Text style={styles.caption} numberOfLines={2}>
              {caption}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export function VibeSwipeFeed({
  videos,
  adPlacements = [],
  onLoadMore,
  loadingMore,
  onUpload,
  refreshing = false,
  onRefresh,
  onReport,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { user } = useApp();
  const cardH = SCREEN_H;
  const bottomChrome = insets.bottom + TAB_BAR_H;
  const listRef = useRef<FlatList<VibeRow>>(null);
  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 80 }).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [likedMap, setLikedMap] = useState<Record<number, boolean>>({});
  const [subscribedMap, setSubscribedMap] = useState<Record<number, boolean>>({});
  const [commentVideo, setCommentVideo] = useState<ReelsVideo | null>(null);
  const [detailsVideo, setDetailsVideo] = useState<ReelsVideo | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});
  const [screenFocused, setScreenFocused] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

  const rows = React.useMemo(() => buildVibeRows(videos, adPlacements), [videos, adPlacements]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setActiveIndex(first.index);
      if (
        onLoadMore
        && first?.index != null
        && first.index >= rows.length - 3
        && !loadingMore
      ) {
        onLoadMore();
      }
    },
    [rows.length, onLoadMore, loadingMore],
  );

  const like = async (video: ReelsVideo) => {
    if (!user?.dbId) return;
    const wasLiked = likedMap[video.id] ?? video.myReaction === "like";
    if (wasLiked) {
      setLikedMap((m) => ({ ...m, [video.id]: false }));
      return;
    }
    setLikedMap((m) => ({ ...m, [video.id]: true }));
    try {
      await reactReelsVideo(video.id, user.dbId, "like", user.sessionToken);
    } catch {
      setLikedMap((m) => ({ ...m, [video.id]: false }));
    }
  };

  const follow = async (video: ReelsVideo) => {
    if (!user?.dbId) return;
    const wasSubscribed = subscribedMap[video.channelId] ?? false;
    setSubscribedMap((m) => ({ ...m, [video.channelId]: !wasSubscribed }));
    try {
      if (wasSubscribed) {
        await unsubscribeReelsChannel(video.channelId, user.dbId, user.sessionToken);
      } else {
        await subscribeReelsChannel(video.channelId, user.dbId, user.sessionToken);
      }
    } catch {
      setSubscribedMap((m) => ({ ...m, [video.channelId]: wasSubscribed }));
    }
  };

  const share = (video: ReelsVideo) => {
    if (!user?.dbId) return;
    void shareReelsVideoLink(video, user.dbId, user.sessionToken);
  };

  const openChannel = (video: ReelsVideo) => {
    if (video.channelHandle) {
      router.push(`/reels/channel/${video.channelHandle}` as never);
    }
  };

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    await onRefresh();
    setActiveIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [onRefresh]);

  if (videos.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: "#000" }]}>
        <Ionicons name="flash-outline" size={52} color="rgba(255,255,255,0.55)" />
        <Text style={styles.emptyTitle}>No {VIBE_BRAND_NAME} clips yet</Text>
        <Text style={styles.emptyHint}>
          Upload a vertical clip under 60 seconds to appear in {VIBE_BRAND_NAME}.
        </Text>
        {onUpload ? (
          <TouchableOpacity style={styles.emptyUploadBtn} onPress={onUpload} activeOpacity={0.85}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={styles.emptyUploadText}>Upload {VIBE_BRAND_NAME}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <>
      {refreshing ? (
        <View style={[styles.refreshBadge, { top: insets.top + 52 }]} pointerEvents="none">
          <ActivityIndicator color="#fff" size="small" />
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardH}
        snapToAlignment="start"
        getItemLayout={(_, index) => ({ length: cardH, offset: cardH * index, index })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfig}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews={Platform.OS !== "android"}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor="#fff"
              colors={["#ffffff"]}
              progressBackgroundColor="rgba(0,0,0,0.35)"
              progressViewOffset={insets.top + 56}
            />
          ) : undefined
        }
        renderItem={({ item, index }) => {
          if (item.kind === "ad") {
            return (
              <VibeAdCard
                ad={item.ad}
                height={cardH}
                bottomPad={bottomChrome}
                isActive={screenFocused && index === activeIndex}
              />
            );
          }
          const video = item.video;
          const cardActive = screenFocused && index === activeIndex;
          return (
            <VibeCard
              item={video}
              height={cardH}
              bottomChrome={bottomChrome}
              isActive={cardActive}
              liked={likedMap[video.id] ?? video.myReaction === "like"}
              subscribed={subscribedMap[video.channelId] ?? false}
              commentsOpen={commentVideo?.id === video.id}
              detailsOpen={detailsVideo?.id === video.id}
              userId={user?.dbId}
              sessionToken={user?.sessionToken}
              onLike={() => void like(video)}
              onComment={() => {
                setDetailsVideo(null);
                setCommentVideo(video);
              }}
              onShare={() => share(video)}
              onMore={() => {
                setCommentVideo(null);
                setDetailsVideo(video);
              }}
              onReport={onReport ? () => onReport(video) : undefined}
              onFollow={() => void follow(video)}
              onOpenChannel={() => openChannel(video)}
            />
          );
        }}
        style={{ width: SCREEN_W }}
      />
      {commentVideo && user?.dbId ? (
        <ReelsCommentsSheet
          visible
          variant="vibe"
          onClose={() => setCommentVideo(null)}
          videoId={commentVideo.id}
          commentCount={commentCounts[commentVideo.id] ?? commentVideo.commentCount}
          userId={user.dbId}
          sessionToken={user.sessionToken}
          userAvatarUrl={user.avatar}
          channelLabel={
            commentVideo.channelDisplayName
            ?? (commentVideo.channelHandle ? `@${commentVideo.channelHandle}` : "this clip")
          }
          onCommentPosted={() => {
            setCommentCounts((m) => ({
              ...m,
              [commentVideo.id]: (m[commentVideo.id] ?? commentVideo.commentCount) + 1,
            }));
          }}
        />
      ) : null}
      {detailsVideo ? (
        <VibeDetailsSheet
          visible
          onClose={() => setDetailsVideo(null)}
          video={detailsVideo}
          editorMeta={parseEditorMeta(detailsVideo.editorMetadata)}
          subscribed={subscribedMap[detailsVideo.channelId] ?? false}
          onFollow={() => void follow(detailsVideo)}
          onOpenChannel={() => openChannel(detailsVideo)}
          onReport={onReport ? () => {
            setDetailsVideo(null);
            onReport(detailsVideo);
          } : undefined}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { width: SCREEN_W, position: "relative" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.12)" },
  topGradient: { position: "absolute", top: 0, left: 0, right: 0, height: 120, zIndex: 2 },
  bottomGradient: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 2 },
  sideActions: {
    position: "absolute",
    right: 8,
    alignItems: "center",
    gap: 20,
    zIndex: 4,
  },
  sideBtn: { alignItems: "center", gap: 2 },
  sideLabel: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomMeta: {
    position: "absolute",
    left: 12,
    right: 64,
    bottom: 0,
    zIndex: 4,
    gap: 8,
  },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  authorTap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: "#fff" },
  avatarPlaceholder: { backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  handle: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  followBtn: {
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  followBtnDone: { borderColor: "rgba(255,255,255,0.45)", backgroundColor: "rgba(255,255,255,0.12)" },
  followText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  followTextDone: { color: "rgba(255,255,255,0.85)" },
  caption: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center", color: "#fff" },
  emptyHint: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, color: "rgba(255,255,255,0.65)" },
  emptyUploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#059669",
  },
  emptyUploadText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  refreshBadge: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 40,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
});
