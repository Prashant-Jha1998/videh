import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReelsFeedAdCard } from "@/components/ReelsFeedAdCard";
import { ReelsFeedVideoMenu, type FeedVideoMenuAction } from "@/components/ReelsFeedVideoMenu";
import { VibeSwipeFeed } from "@/components/VibeSwipeFeed";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { interpolate } from "@/lib/i18n";
import {
  addReelsVideoToPlaylist,
  createReelsPlaylist,
  fetchMyReelsChannel,
  fetchReelsFeed,
  fetchReelsVideoNotificationUnreadCount,
  formatDuration,
  formatTimeAgo,
  formatViewCount,
  reportReelsVideo,
  type ReelsChannel,
  type ReelsFeedAdPlacement,
  type ReelsFeedCursor,
  type ReelsPlaylist,
  type ReelsVideo,
  type ReelsVibeAdPlacement,
} from "@/lib/reelsApi";
import { loadReelsFeedCache, saveReelsFeedCache } from "@/lib/reelsFeedCache";
import {
  addBlockedChannel,
  addNotInterestedVideo,
  addToPlayQueue,
  addToWatchLater,
  filterFeedVideos,
  loadFeedHiddenIds,
} from "@/lib/reelsLibrary";
import { shareReelsVideoLink } from "@/lib/reelsShare";
import { downloadReelsVideoToApp } from "@/lib/reelsVideoDownload";
import { isVibeVideo, isWatchVideo, VIBE_BRAND_NAME } from "@/lib/vibeVideo";

type VideoSection = "watch" | "vibe";

type FeedRow =
  | { kind: "video"; key: string; video: ReelsVideo }
  | { kind: "ad"; key: string; ad: ReelsFeedAdPlacement["ad"] };

type FeedCategory = "all" | "news" | "podcasts" | "music" | "international";

const FEED_CATEGORIES: { id: FeedCategory | "explore"; label?: string; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { id: "explore", icon: "compass-outline" },
  { id: "all", label: "All" },
  { id: "news", label: "News" },
  { id: "podcasts", label: "Podcasts" },
  { id: "music", label: "Music" },
  { id: "international", label: "International affairs" },
];

const CATEGORY_KEYWORDS: Record<Exclude<FeedCategory, "all">, string[]> = {
  news: ["news", "breaking", "headline", "reporter", "politics", "election"],
  podcasts: ["podcast", "episode", "interview", "talk"],
  music: ["music", "song", "album", "concert", "cover", "remix", "audio"],
  international: ["world", "international", "global", "foreign", "diplomacy", "affairs"],
};

function matchesCategory(video: ReelsVideo, category: FeedCategory): boolean {
  if (category === "all") return true;
  const text = [
    video.title,
    video.description ?? "",
    ...(video.hashtags ?? []),
  ].join(" ").toLowerCase();
  return CATEGORY_KEYWORDS[category].some((kw) => text.includes(kw));
}

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

function VideoThumb({
  uri,
  videoId,
  placeholderColor,
  iconColor,
}: {
  uri: string | null | undefined;
  videoId: number;
  placeholderColor: string;
  iconColor: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: placeholderColor }]}>
        <Ionicons name="videocam" size={40} color={iconColor} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.thumb}
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
  primaryColor,
}: {
  uri: string | null | undefined;
  channelId: number;
  label: string;
  primaryColor: string;
}) {
  const [failed, setFailed] = useState(false);
  const initial = (label.replace(/^@/, "")[0] ?? "?").toUpperCase();
  if (!uri || failed) {
    return (
      <View style={[styles.channelAvatar, { backgroundColor: primaryColor }]}>
        <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 }}>{initial}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.channelAvatar}
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
  const params = useLocalSearchParams<{ section?: string; refreshFeed?: string }>();
  const { user } = useApp();
  const { t } = useUiPreferences();
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [adPlacements, setAdPlacements] = useState<ReelsFeedAdPlacement[]>([]);
  const [vibeAdPlacements, setVibeAdPlacements] = useState<ReelsVibeAdPlacement[]>([]);
  const videoCountRef = useRef(0);
  const vibeCountRef = useRef(0);
  const [nextCursor, setNextCursor] = useState<ReelsFeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasChannel, setHasChannel] = useState<boolean | null>(null);
  const [myChannel, setMyChannel] = useState<ReelsChannel | null>(null);
  const [myPlaylists, setMyPlaylists] = useState<ReelsPlaylist[]>([]);
  const [feedCategory, setFeedCategory] = useState<FeedCategory>("all");
  const [videoSection, setVideoSection] = useState<VideoSection>("watch");
  const [menuVideo, setMenuVideo] = useState<ReelsVideo | null>(null);
  const [playlistPickerVideo, setPlaylistPickerVideo] = useState<ReelsVideo | null>(null);
  const [createPlaylistVideo, setCreatePlaylistVideo] = useState<ReelsVideo | null>(null);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState("");
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [addingToPlaylist, setAddingToPlaylist] = useState(false);
  const [hiddenVideoIds, setHiddenVideoIds] = useState<Set<number>>(new Set());
  const [hiddenChannelIds, setHiddenChannelIds] = useState<Set<number>>(new Set());
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [feedError, setFeedError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const loadingMoreRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const handledUploadReturnRef = useRef(false);

  const refreshHidden = useCallback(async () => {
    const hidden = await loadFeedHiddenIds();
    setHiddenVideoIds(hidden.videoIds);
    setHiddenChannelIds(hidden.channelIds);
  }, []);

  const refreshUnreadNotifications = useCallback(async () => {
    if (!user?.dbId) {
      setUnreadNotifCount(0);
      return;
    }
    try {
      const res = await fetchReelsVideoNotificationUnreadCount(user.dbId, user.sessionToken);
      setUnreadNotifCount(Math.max(0, res.count ?? 0));
    } catch {
      setUnreadNotifCount(0);
    }
  }, [user?.dbId, user?.sessionToken]);

  const applyFeed = useCallback((feed: {
    videos?: ReelsVideo[];
    feedAdPlacements?: ReelsFeedAdPlacement[];
    vibeAdPlacements?: ReelsVibeAdPlacement[];
    nextCursor?: ReelsFeedCursor | null;
  }) => {
    setVideos(feed.videos ?? []);
    setAdPlacements(feed.feedAdPlacements ?? []);
    setVibeAdPlacements(feed.vibeAdPlacements ?? []);
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
          feedAdPlacements: cached.adPlacements,
          vibeAdPlacements: cached.vibeAdPlacements,
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
      setFeedError(false);
      setLoading(false);
      if ((feed.videos ?? []).length > 0) {
        void saveReelsFeedCache(uid, {
          videos: feed.videos ?? [],
          trending: feed.trending,
          adPlacements: feed.feedAdPlacements,
          vibeAdPlacements: feed.vibeAdPlacements,
          nextCursor: feed.nextCursor,
        });
      }

      const ch = await channelPromise;
      setMyChannel(ch.channel ?? null);
      setHasChannel(Boolean(ch.channel));
      setMyPlaylists(ch.playlists ?? []);
      void refreshHidden();
    } catch {
      setFeedError(true);
      setLoading(false);
    }
  }, [user?.dbId, user?.sessionToken, applyFeed, refreshHidden]);

  useEffect(() => {
    if (params.section === "vibe") {
      setVideoSection("vibe");
    }
    if (params.refreshFeed === "1" && !handledUploadReturnRef.current) {
      handledUploadReturnRef.current = true;
      void loadInitial({ silent: false });
      router.setParams({ section: undefined, refreshFeed: undefined } as never);
    }
  }, [params.section, params.refreshFeed, loadInitial, router]);

  const loadMore = useCallback(async () => {
    if (!user?.dbId || !nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const feed = await fetchReelsFeed(user.dbId, nextCursor, user.sessionToken);
      const incoming = feed.videos ?? [];
      const vibeOffset = vibeCountRef.current;
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
      const batchVibePlacements = feed.vibeAdPlacements ?? [];
      if (batchVibePlacements.length > 0) {
        setVibeAdPlacements((prev) => [
          ...prev,
          ...batchVibePlacements.map((p) => ({
            insertAfterIndex: vibeOffset + p.insertAfterIndex,
            ad: p.ad,
          })),
        ]);
      }
      setNextCursor(feed.nextCursor ?? null);
    } catch {
      setLoadMoreError(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [user?.dbId, user?.sessionToken, nextCursor]);

  useFocusEffect(
    useCallback(() => {
      void loadInitial({ silent: loadedOnceRef.current });
      void refreshHidden();
      void refreshUnreadNotifications();
    }, [loadInitial, refreshHidden, refreshUnreadNotifications]),
  );

  useFocusEffect(
    useCallback(() => {
      void SystemUI.setBackgroundColorAsync(colors.background);
      return () => {
        void SystemUI.setBackgroundColorAsync(colors.headerBg ?? colors.primary);
      };
    }, [colors.background, colors.headerBg, colors.primary]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitial({ silent: true });
    setRefreshing(false);
  };

  const openVideo = (v: ReelsVideo) => {
    router.push({ pathname: "/reels/watch/[id]", params: { id: String(v.id) } } as never);
  };

  const openChannel = (item: ReelsVideo) => {
    if (item.channelHandle) {
      router.push({ pathname: "/reels/channel/[handle]", params: { handle: item.channelHandle } } as never);
    }
  };

  const openUpload = () => {
    router.push("/reels/upload" as never);
  };

  const openVibeUpload = () => {
    router.push("/reels/vibe-upload" as never);
  };

  const openLibrary = () => {
    router.push("/reels/library" as never);
  };

  const openProfile = () => {
    if (myChannel?.handle) {
      router.push({ pathname: "/reels/channel/[handle]", params: { handle: myChannel.handle } });
      return;
    }
    router.push("/reels/setup");
  };

  const profileAvatarUri = myChannel?.avatarUrl ?? user?.avatar ?? null;

  const channelLabel = (v: ReelsVideo) =>
    v.channelDisplayName ?? (v.channelHandle ? `@${v.channelHandle}` : "Channel");

  const visibleVideos = useMemo(() => {
    const hidden = { videoIds: hiddenVideoIds, channelIds: hiddenChannelIds };
    return filterFeedVideos(videos, hidden)
      .filter((v) => matchesCategory(v, feedCategory))
      .filter((v) =>
        videoSection === "vibe"
          ? isVibeVideo(v.durationSeconds, v.videoFormat)
          : isWatchVideo(v.durationSeconds, v.videoFormat),
      );
  }, [videos, hiddenVideoIds, hiddenChannelIds, feedCategory, videoSection]);

  const vibeVideos = useMemo(
    () => visibleVideos.filter((v) => isVibeVideo(v.durationSeconds, v.videoFormat)),
    [visibleVideos],
  );

  useEffect(() => {
    videoCountRef.current = visibleVideos.length;
  }, [visibleVideos.length]);

  useEffect(() => {
    vibeCountRef.current = videos.filter((v) => isVibeVideo(v.durationSeconds, v.videoFormat)).length;
  }, [videos]);

  const feedRows = useMemo(
    () => buildFeedRows(visibleVideos, adPlacements),
    [visibleVideos, adPlacements],
  );

  const hideVideoFromFeed = (videoId: number) => {
    setHiddenVideoIds((prev) => new Set([...prev, videoId]));
  };

  const hideChannelFromFeed = (channelId: number) => {
    setHiddenChannelIds((prev) => new Set([...prev, channelId]));
  };

  const promptReport = (video: ReelsVideo) => {
    if (!user?.dbId) return;
    Alert.alert("Report video", "Why are you reporting this video?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Spam or misleading",
        onPress: () => void submitReport(video, "Spam or misleading"),
      },
      {
        text: "Sexual content",
        onPress: () => void submitReport(video, "Sexual content"),
      },
      {
        text: "Harmful or dangerous",
        onPress: () => void submitReport(video, "Harmful or dangerous"),
      },
      {
        text: "Hate speech",
        onPress: () => void submitReport(video, "Hate speech"),
      },
    ]);
  };

  const submitReport = async (video: ReelsVideo, reason: string) => {
    if (!user?.dbId) return;
    const res = await reportReelsVideo(video.id, user.dbId, reason, user.sessionToken);
    if (res.success) {
      hideVideoFromFeed(video.id);
      Alert.alert("Report submitted", res.message ?? "Thank you for helping keep Videh safe.");
    } else {
      Alert.alert("Error", res.message ?? "Could not submit report.");
    }
  };

  const addVideoToPlaylist = async (playlistId: number) => {
    if (!user?.dbId || !playlistPickerVideo) return;
    setAddingToPlaylist(true);
    try {
      const res = await addReelsVideoToPlaylist(
        user.dbId,
        playlistId,
        playlistPickerVideo.id,
        user.sessionToken,
      );
      if (!res.success) {
        Alert.alert("Error", res.message ?? "Could not add to playlist.");
        return;
      }
      setMyPlaylists(res.playlists ?? myPlaylists);
      setPlaylistPickerVideo(null);
      Alert.alert("Saved", `"${playlistPickerVideo.title}" added to playlist.`);
    } finally {
      setAddingToPlaylist(false);
    }
  };

  const loadMyPlaylists = useCallback(async () => {
    if (!user?.dbId) return [];
    const res = await fetchMyReelsChannel(user.dbId, user.sessionToken);
    const list = res.playlists ?? [];
    setMyPlaylists(list);
    return list;
  }, [user?.dbId, user?.sessionToken]);

  const promptCreatePlaylist = (video: ReelsVideo) => {
    setCreatePlaylistVideo(video);
    setNewPlaylistTitle("");
  };

  const submitCreatePlaylist = async () => {
    if (!user?.dbId || !createPlaylistVideo) return;
    const trimmed = newPlaylistTitle.trim();
    if (!trimmed) {
      Alert.alert("Title", "Enter a playlist name.");
      return;
    }
    setCreatingPlaylist(true);
    try {
      const res = await createReelsPlaylist(
        user.dbId,
        { title: trimmed, videoIds: [createPlaylistVideo.id] },
        user.sessionToken,
      );
      if (!res.success) {
        Alert.alert("Error", res.message ?? "Could not create playlist.");
        return;
      }
      setMyPlaylists(res.playlists ?? []);
      setCreatePlaylistVideo(null);
      Alert.alert("Saved", `"${createPlaylistVideo.title}" added to "${trimmed}".`);
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const handleMenuAction = (action: FeedVideoMenuAction, video: ReelsVideo) => {
    if (!user?.dbId) return;
    switch (action) {
      case "play_next":
        void addToPlayQueue(video).then((added) => {
          Alert.alert(
            added ? "Added to queue" : "Already in queue",
            added ? `"${video.title}" will play next.` : "This video is already in your queue.",
          );
        });
        break;
      case "watch_later":
        void addToWatchLater(video).then((added) => {
          Alert.alert(
            added ? "Saved" : "Already saved",
            added ? `"${video.title}" added to Watch Later.` : "Already in Watch Later.",
          );
        });
        break;
      case "save_playlist":
        void (async () => {
          const playlists = myPlaylists.length > 0 ? myPlaylists : await loadMyPlaylists();
          if (playlists.length === 0) {
            Alert.alert("No playlists", "Create a playlist to save videos.", [
              { text: "Cancel", style: "cancel" },
              { text: "Create", onPress: () => promptCreatePlaylist(video) },
            ]);
          } else {
            setPlaylistPickerVideo(video);
          }
        })();
        break;
      case "download":
        void downloadReelsVideoToApp(video).catch(() => {
          Alert.alert("Error", "Download failed.");
        });
        break;
      case "share":
        void shareReelsVideoLink(video, user.dbId, user.sessionToken);
        break;
      case "not_interested":
        void addNotInterestedVideo(video.id).then(() => {
          hideVideoFromFeed(video.id);
          Alert.alert("Got it", "We will show you fewer videos like this.");
        });
        break;
      case "dont_recommend_channel":
        void addBlockedChannel(video.channelId).then(() => {
          hideChannelFromFeed(video.channelId);
          Alert.alert("Got it", `We won't recommend videos from ${channelLabel(video)}.`);
        });
        break;
      case "report":
        promptReport(video);
        break;
      default:
        break;
    }
  };

  const renderVideoCard = (item: ReelsVideo) => (
    <View style={styles.ytCard}>
      <TouchableOpacity onPress={() => openVideo(item)} activeOpacity={0.9}>
        <View style={styles.thumbWrap}>
          <VideoThumb
            uri={item.thumbnailUrl}
            videoId={item.id}
            placeholderColor={colors.muted}
            iconColor={colors.mutedForeground}
          />
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.infoRow}>
        <TouchableOpacity
          onPress={() => openChannel(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={!item.channelHandle}
          style={!item.channelHandle ? { opacity: 0.6 } : undefined}
        >
          <ChannelAvatar
            uri={item.channelAvatarUrl}
            channelId={item.channelId}
            label={channelLabel(item)}
            primaryColor={colors.primary}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.infoText} onPress={() => openVideo(item)} activeOpacity={0.85}>
          <Text style={[styles.ytTitle, { color: colors.foreground }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.ytMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {channelLabel(item)} · {formatViewCount(item.viewCount)} views
            {(item.shareCount ?? 0) > 0 ? ` · ${formatViewCount(item.shareCount ?? 0)} shares` : ""}
            {item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMenuVideo(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.menuBtn}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: FeedRow }) =>
    item.kind === "ad" ? <ReelsFeedAdCard ad={item.ad} /> : renderVideoCard(item.video);

  const categoryChips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsBar}
      contentContainerStyle={styles.chipsContent}
    >
      {FEED_CATEGORIES.map((cat) => {
        if (cat.id === "explore") {
          return (
            <TouchableOpacity
              key="explore"
              style={[styles.chipIcon, { backgroundColor: colors.muted }]}
              onPress={() => router.push("/reels/search" as never)}
              accessibilityLabel={t("reels.explore")}
            >
              <Ionicons name="compass-outline" size={20} color={colors.foreground} />
            </TouchableOpacity>
          );
        }
        const active = feedCategory === cat.id;
        return (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.chip,
              { backgroundColor: active ? colors.foreground : colors.muted },
            ]}
            onPress={() => setFeedCategory(cat.id as FeedCategory)}
          >
            <Text
              style={{
                color: active ? colors.background : colors.foreground,
                fontFamily: "Inter_600SemiBold",
                fontSize: 13,
              }}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const listHeader = (
    <>
      {feedError ? (
        <TouchableOpacity
          style={[styles.errorBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => void loadInitial({ silent: true })}
          activeOpacity={0.85}
        >
          <Ionicons name="cloud-offline-outline" size={22} color={colors.destructive} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.foreground }]}>{t("reels.feedError")}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{t("reels.feedErrorHint")}</Text>
          </View>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{t("reels.retry")}</Text>
        </TouchableOpacity>
      ) : null}
      {hasChannel === false ? (
        <TouchableOpacity
          style={[styles.setupBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.push("/reels/setup" as never)}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.foreground }]}>{t("reels.createChannel")}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {t("reels.createChannelHint")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      ) : hasChannel ? (
        <TouchableOpacity
          style={[styles.setupBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={openUpload}
        >
          <Ionicons name="cloud-upload-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: colors.foreground }]}>{t("reels.uploadBannerTitle")}</Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              {t("reels.uploadBannerHint")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
      ) : null}
    </>
  );

  const headerBar = (
    <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
      <View style={styles.logoRow}>
        <Image
          source={require("@/assets/images/videh_icon_foreground.png")}
          style={[styles.logoImage, { tintColor: colors.primary }]}
          contentFit="contain"
        />
        <Text style={[styles.logoText, { color: colors.foreground }]}>Videh</Text>
      </View>
      <View style={styles.headerActions}>
        {hasChannel ? (
          <TouchableOpacity onPress={openUpload} style={styles.iconBtn} accessibilityLabel={t("reels.uploadVideo")}>
            <Ionicons name="videocam-outline" size={24} color={colors.foreground} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={openLibrary} style={styles.iconBtn} accessibilityLabel={t("reels.libraryTitle")}>
          <Ionicons name="albums-outline" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push("/reels/notifications" as never)}
          style={styles.iconBtn}
        >
          <Ionicons name="notifications-outline" size={24} color={colors.foreground} />
          {unreadNotifCount > 0 ? (
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>
                {unreadNotifCount > 9 ? "9+" : String(unreadNotifCount)}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity onPress={openProfile} style={styles.iconBtn} accessibilityLabel={t("reels.yourChannel")}>
          {profileAvatarUri ? (
            <Image source={{ uri: profileAvatarUri }} style={styles.profileBtnAvatar} contentFit="cover" />
          ) : (
            <Ionicons name="person-circle-outline" size={26} color={colors.foreground} />
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/reels/search" as never)} style={styles.iconBtn}>
          <Ionicons name="search" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const sectionTabs = (
    <View style={[styles.sectionTabs, { borderBottomColor: colors.border }]}>
      {(["watch", "vibe"] as const).map((id) => {
        const active = videoSection === id;
        const label = id === "watch" ? t("video.section.watch") : VIBE_BRAND_NAME;
        return (
          <TouchableOpacity
            key={id}
            style={[styles.sectionTab, active && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setVideoSection(id)}
          >
            <Text
              style={{
                color: active ? colors.primary : colors.mutedForeground,
                fontFamily: active ? "Inter_700Bold" : "Inter_500Medium",
                fontSize: 14,
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const topChrome = (
    <View
      style={[
        styles.topChrome,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
        },
      ]}
    >
      {headerBar}
      {sectionTabs}
      {videoSection === "watch" ? categoryChips : null}
    </View>
  );

  const tabStatusBar = (
    <StatusBar
      style={colors.isDark ? "light" : "dark"}
      backgroundColor={colors.background}
      translucent={Platform.OS === "android"}
    />
  );

  if (loading && videos.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {tabStatusBar}
        {topChrome}
        <VideoFeedSkeleton
          mutedColor={colors.muted}
          softColor={colors.border ?? colors.muted}
        />
      </View>
    );
  }

  if (videoSection === "vibe") {
    return (
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <StatusBar style="light" backgroundColor="#000" translucent={Platform.OS === "android"} />
        <VibeSwipeFeed
          videos={vibeVideos}
          adPlacements={vibeAdPlacements}
          onLoadMore={() => void loadMore()}
          loadingMore={loadingMore}
          onUpload={hasChannel ? openVibeUpload : undefined}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onReport={promptReport}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0.55)", "rgba(0,0,0,0.2)", "transparent"]}
          style={[styles.vibeHeaderOverlay, { paddingTop: insets.top + 6 }]}
          pointerEvents="box-none"
        >
          {hasChannel ? (
            <TouchableOpacity onPress={openVibeUpload} style={styles.vibeIconBtn} accessibilityLabel={`Upload ${VIBE_BRAND_NAME}`}>
              <Ionicons name="add" size={30} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.vibeIconBtn} />
          )}
          <View style={styles.vibeTopTabs}>
            {(["watch", "vibe"] as const).map((id) => {
              const active = id === "vibe";
              const label = id === "watch" ? t("video.section.watch") : VIBE_BRAND_NAME;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setVideoSection(id)}
                  style={styles.vibeTopTab}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.vibeTopTabText, active && styles.vibeTopTabTextActive]}>{label}</Text>
                  {active ? <View style={styles.vibeTopTabIndicator} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity onPress={() => router.push("/reels/search" as never)} style={styles.vibeIconBtn}>
            <Ionicons name="search" size={24} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {tabStatusBar}
      {topChrome}

      <FlatList
        style={styles.feedList}
        data={feedRows}
        keyExtractor={(row) => row.key}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="play-circle-outline" size={56} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {!user?.dbId
                ? t("reels.signInHint")
                : feedCategory === "all"
                  ? t("reels.noVideos")
                  : t("reels.noCategoryVideos")}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
              {!user?.dbId
                ? ""
                : feedCategory === "all"
                  ? t("reels.noVideosHint")
                  : t("reels.noCategoryHint")}
            </Text>
            {hasChannel && user?.dbId ? (
              <TouchableOpacity style={[styles.emptyCta, { backgroundColor: colors.primary }]} onPress={openUpload}>
                <Text style={styles.emptyCtaText}>{t("reels.uploadVideo")}</Text>
              </TouchableOpacity>
            ) : hasChannel === false && user?.dbId ? (
              <TouchableOpacity
                style={[styles.emptyCta, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/reels/setup" as never)}
              >
                <Text style={styles.emptyCtaText}>{t("reels.createChannel")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadMoreError ? (
            <TouchableOpacity style={styles.footerRetry} onPress={() => void loadMore()}>
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{t("reels.loadMoreError")} · {t("reels.retry")}</Text>
            </TouchableOpacity>
          ) : loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
      />

      {hasChannel ? (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
          onPress={openUpload}
          accessibilityLabel={t("reels.uploadVideo")}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      ) : null}

      <ReelsFeedVideoMenu
        visible={menuVideo != null}
        videoTitle={menuVideo?.title}
        onClose={() => setMenuVideo(null)}
        onAction={(action) => {
          if (menuVideo) handleMenuAction(action, menuVideo);
        }}
      />

      <Modal
        visible={playlistPickerVideo != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPlaylistPickerVideo(null)}
      >
        <View style={styles.modalRoot}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, maxHeight: "70%" }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Save to playlist</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {myPlaylists.map((pl) => (
                <TouchableOpacity
                  key={pl.id}
                  style={[styles.playlistPickRow, { borderBottomColor: colors.border }]}
                  disabled={addingToPlaylist}
                  onPress={() => void addVideoToPlaylist(pl.id)}
                >
                  <Ionicons name="list" size={20} color={colors.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                      {pl.title}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{pl.videoCount} videos</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => {
                if (playlistPickerVideo) promptCreatePlaylist(playlistPickerVideo);
              }}
              style={styles.playlistCreateRow}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>New playlist</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPlaylistPickerVideo(null)} style={styles.modalCancel}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={createPlaylistVideo != null}
        transparent
        animationType="fade"
        onRequestClose={() => setCreatePlaylistVideo(null)}
      >
        <View style={styles.modalRoot}>
          <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New playlist</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder="Playlist name"
              placeholderTextColor={colors.mutedForeground}
              value={newPlaylistTitle}
              onChangeText={setNewPlaylistTitle}
              maxLength={200}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setCreatePlaylistVideo(null)} style={styles.modalCancelBtn}>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitCreatePlaylist()}
                disabled={creatingPlaylist}
                style={{ opacity: creatingPlaylist ? 0.6 : 1 }}
              >
                {creatingPlaylist ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  feedList: { flex: 1 },
  topChrome: {
    zIndex: 10,
    elevation: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  center: { alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center", marginTop: 8 },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },
  emptyCta: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22 },
  emptyCtaText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    margin: 12,
    marginBottom: 0,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  footerRetry: { alignItems: "center", paddingVertical: 16 },
  fab: {
    position: "absolute",
    bottom: 96,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoImage: { width: 30, height: 30 },
  logoText: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerActions: { flexDirection: "row", alignItems: "center" },
  iconBtn: { padding: 8, position: "relative" },
  profileBtnAvatar: { width: 28, height: 28, borderRadius: 14 },
  notifBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#FF0000",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  chipsBar: {},
  chipsContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: "center" },
  sectionTabs: { flexDirection: "row", paddingHorizontal: 16, gap: 20 },
  sectionTab: { paddingVertical: 10, paddingHorizontal: 2 },
  vibeHeaderOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 20,
  },
  vibeIconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  vibeTopTabs: { flexDirection: "row", alignItems: "center", gap: 18, paddingTop: 8 },
  vibeTopTab: { alignItems: "center", gap: 4, minWidth: 56 },
  vibeTopTabText: { color: "rgba(255,255,255,0.55)", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  vibeTopTabTextActive: { color: "#fff", fontFamily: "Inter_700Bold" },
  vibeTopTabIndicator: { width: 28, height: 2, borderRadius: 1, backgroundColor: "#fff" },
  chipIcon: {
    width: 36,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, marginRight: 8 },
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
  ytCard: { marginBottom: 12 },
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
  channelAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  infoText: { flex: 1, minWidth: 0 },
  ytTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 18, paddingRight: 4 },
  ytMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  menuBtn: { paddingTop: 2, paddingLeft: 4 },
  footerLoader: { alignItems: "center", paddingVertical: 20 },
  skeletonWrap: { paddingBottom: 24 },
  skeletonCard: { marginBottom: 16 },
  skeletonAvatar: { width: 36, height: 36, borderRadius: 18 },
  skeletonLines: { flex: 1, gap: 8, paddingTop: 2 },
  skeletonLine: { height: 12, borderRadius: 6 },
  modalRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 14, padding: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 12 },
  playlistPickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  playlistCreateRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14 },
  modalCancel: { alignItems: "center", paddingVertical: 10 },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 20, marginTop: 16 },
  modalCancelBtn: { paddingVertical: 8 },
});
