import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReelsCommentsSheet } from "@/components/ReelsCommentsSheet";
import { VibeAdCard } from "@/components/VibeAdCard";
import { VibeInlinePlayer } from "@/components/VibeInlinePlayer";
import { useColors } from "@/hooks/useColors";
import { formatViewCount, reactReelsVideo, type ReelsVideo, type ReelsVibeAdPlacement } from "@/lib/reelsApi";
import { shareReelsVideoLink } from "@/lib/reelsShare";
import type { VideoEditorMetadata } from "@/lib/videoEditor";
import { VIBE_BRAND_NAME } from "@/lib/vibeVideo";
import { useApp } from "@/context/AppContext";

const SCREEN_H = Dimensions.get("window").height;
const SCREEN_W = Dimensions.get("window").width;

type Props = {
  videos: ReelsVideo[];
  adPlacements?: ReelsVibeAdPlacement[];
  onLoadMore?: () => void;
  loadingMore?: boolean;
  onUpload?: () => void;
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

function VibeCard({
  item,
  height,
  bottomPad,
  isActive,
  liked,
  userId,
  sessionToken,
  onLike,
  onComment,
  onShare,
}: {
  item: ReelsVideo;
  height: number;
  bottomPad: number;
  isActive: boolean;
  liked: boolean;
  userId?: number;
  sessionToken?: string | null;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
}) {
  const colors = useColors();
  const channel = item.channelDisplayName ?? (item.channelHandle ? `@${item.channelHandle}` : "Channel");
  const editorMeta = parseEditorMeta(item.editorMetadata);
  const canPlay = Boolean(item.videoUrl && item.videoUrl.trim().length > 0);

  return (
    <View style={[styles.card, { height, backgroundColor: "#0a0a0a" }]}>
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
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
          posterUrl={item.thumbnailUrl}
          editorMetadata={editorMeta}
          musicTitle={item.musicTitle}
        />
      ) : null}

      {!isActive ? <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" /> : null}

      <View style={[styles.sideActions, { bottom: bottomPad + 88 }]}>
        <TouchableOpacity style={styles.sideBtn} onPress={onLike} hitSlop={6}>
          <Ionicons name={liked ? "heart" : "heart-outline"} size={28} color={liked ? "#EF4444" : "#fff"} />
          <Text style={styles.sideLabel}>{formatViewCount(item.likeCount + (liked && item.myReaction !== "like" ? 1 : 0))}</Text>
        </TouchableOpacity>
        {item.commentsEnabled !== false ? (
          <TouchableOpacity style={styles.sideBtn} onPress={onComment} hitSlop={6}>
            <Ionicons name="chatbubble-outline" size={26} color="#fff" />
            <Text style={styles.sideLabel}>{formatViewCount(item.commentCount)}</Text>
          </TouchableOpacity>
        ) : null}
        {item.sharesEnabled !== false ? (
          <TouchableOpacity style={styles.sideBtn} onPress={onShare} hitSlop={6}>
            <Ionicons name="arrow-redo-outline" size={26} color="#fff" />
            <Text style={styles.sideLabel}>{formatViewCount(item.shareCount ?? 0)}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.bottomMeta, { paddingBottom: bottomPad + 12 }]}>
        <Text style={styles.channelName} numberOfLines={1}>{channel}</Text>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.stats}>
          {formatViewCount(item.viewCount)} views
          {(item.shareCount ?? 0) > 0 ? ` · ${formatViewCount(item.shareCount ?? 0)} shares` : ""}
        </Text>
      </View>
    </View>
  );
}

export function VibeSwipeFeed({ videos, adPlacements = [], onLoadMore, loadingMore, onUpload }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useApp();
  const cardH = SCREEN_H;
  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 80 }).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [likedMap, setLikedMap] = useState<Record<number, boolean>>({});
  const [commentVideo, setCommentVideo] = useState<ReelsVideo | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});

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

  const share = (video: ReelsVideo) => {
    if (!user?.dbId) return;
    void shareReelsVideoLink(video, user.dbId, user.sessionToken);
  };

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
      <FlatList
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
        renderItem={({ item, index }) => {
          if (item.kind === "ad") {
            return (
              <VibeAdCard
                ad={item.ad}
                height={cardH}
                bottomPad={insets.bottom}
                isActive={index === activeIndex}
              />
            );
          }
          const video = item.video;
          return (
            <VibeCard
              item={video}
              height={cardH}
              bottomPad={insets.bottom}
              isActive={index === activeIndex}
              liked={likedMap[video.id] ?? video.myReaction === "like"}
              userId={user?.dbId}
              sessionToken={user?.sessionToken}
              onLike={() => void like(video)}
              onComment={() => setCommentVideo(video)}
              onShare={() => share(video)}
            />
          );
        }}
        style={{ width: SCREEN_W }}
      />
      {commentVideo && user?.dbId ? (
        <ReelsCommentsSheet
          visible
          onClose={() => setCommentVideo(null)}
          videoId={commentVideo.id}
          commentCount={commentCounts[commentVideo.id] ?? commentVideo.commentCount}
          userId={user.dbId}
          sessionToken={user.sessionToken}
          userAvatarUrl={user.avatar}
          onCommentPosted={() => {
            setCommentCounts((m) => ({
              ...m,
              [commentVideo.id]: (m[commentVideo.id] ?? commentVideo.commentCount) + 1,
            }));
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { width: SCREEN_W, position: "relative" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.15)" },
  sideActions: {
    position: "absolute",
    right: 10,
    alignItems: "center",
    gap: 18,
    zIndex: 4,
  },
  sideBtn: { alignItems: "center", gap: 4 },
  sideLabel: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  bottomMeta: {
    position: "absolute",
    left: 14,
    right: 72,
    bottom: 0,
    zIndex: 4,
  },
  channelName: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4 },
  title: { color: "rgba(255,255,255,0.92)", fontSize: 14, fontFamily: "Inter_500Medium" },
  stats: { color: "rgba(255,255,255,0.65)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6 },
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
});
