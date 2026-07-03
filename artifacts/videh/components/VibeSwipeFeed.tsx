import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReelsCommentsSheet } from "@/components/ReelsCommentsSheet";
import { VibeInlinePlayer } from "@/components/VibeInlinePlayer";
import { useColors } from "@/hooks/useColors";
import { formatViewCount, reactReelsVideo, type ReelsVideo } from "@/lib/reelsApi";
import { shareReelsVideoLink } from "@/lib/reelsShare";
import type { VideoEditorMetadata } from "@/lib/videoEditor";
import { VIBE_BRAND_NAME } from "@/lib/vibeVideo";
import { useApp } from "@/context/AppContext";

const SCREEN_H = Dimensions.get("window").height;
const SCREEN_W = Dimensions.get("window").width;

type Props = {
  videos: ReelsVideo[];
  onLoadMore?: () => void;
  loadingMore?: boolean;
};

function parseEditorMeta(raw: ReelsVideo["editorMetadata"]): VideoEditorMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  return {
    filter: (src.filter as VideoEditorMetadata["filter"]) ?? "none",
    caption: String(src.caption ?? ""),
    textOverlays: Array.isArray(src.textOverlays)
      ? (src.textOverlays as Array<Record<string, unknown>>).map((t) => ({
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
  const router = useRouter();
  const colors = useColors();
  const channel = item.channelDisplayName ?? (item.channelHandle ? `@${item.channelHandle}` : "Channel");
  const editorMeta = parseEditorMeta(item.editorMetadata);
  const canPlay = Boolean(item.videoUrl && item.videoUrl.trim().length > 0);

  const openFull = () => {
    router.push({ pathname: "/reels/watch/[id]", params: { id: String(item.id), vibe: "1" } } as never);
  };

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
          editorMetadata={editorMeta}
          musicTitle={item.musicTitle}
        />
      ) : null}

      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={openFull}>
        {!isActive ? <View style={styles.scrim} /> : null}
      </TouchableOpacity>

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

export function VibeSwipeFeed({ videos, onLoadMore, loadingMore }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useApp();
  const cardH = SCREEN_H;
  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 80 }).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const [likedMap, setLikedMap] = useState<Record<number, boolean>>({});
  const [commentVideo, setCommentVideo] = useState<ReelsVideo | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems[0];
      if (first?.index != null) setActiveIndex(first.index);
      if (
        onLoadMore
        && first?.index != null
        && first.index >= videos.length - 3
        && !loadingMore
      ) {
        onLoadMore();
      }
    },
    [videos.length, onLoadMore, loadingMore],
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
      <View style={[styles.empty, { backgroundColor: colors.background }]}>
        <Ionicons name="flash-outline" size={52} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No {VIBE_BRAND_NAME} clips yet</Text>
        <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
          Upload a video under 60 seconds to appear in {VIBE_BRAND_NAME}.
        </Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={videos}
        keyExtractor={(v) => `vibe-${v.id}`}
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
        removeClippedSubviews
        renderItem={({ item, index }) => (
          <VibeCard
            item={item}
            height={cardH}
            bottomPad={insets.bottom}
            isActive={index === activeIndex}
            liked={likedMap[item.id] ?? item.myReaction === "like"}
            userId={user?.dbId}
            sessionToken={user?.sessionToken}
            onLike={() => void like(item)}
            onComment={() => setCommentVideo(item)}
            onShare={() => share(item)}
          />
        )}
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
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyHint: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
