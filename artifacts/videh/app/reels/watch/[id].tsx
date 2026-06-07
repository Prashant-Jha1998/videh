import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DismissibleModal } from "@/components/DismissibleModal";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ReelsAdPlayer } from "@/components/ReelsAdPlayer";
import { ReelsWatchPlayer } from "@/components/ReelsWatchPlayer";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  fetchReelsAdBreaks,
  fetchReelsChannel,
  fetchReelsComments,
  fetchReelsFeed,
  fetchReelsVideo,
  recordReelsAdImpression,
  formatDuration,
  formatTimeAgo,
  formatViewCount,
  postReelsComment,
  reactReelsVideo,
  recordReelsView,
  shareReelsVideo,
  subscribeReelsChannel,
  unsubscribeReelsChannel,
  type ReelsAdBreakItem,
  type ReelsAdBreaks,
  type ReelsChannel,
  type ReelsMidRollBreak,
  type ReelsVideo,
} from "@/lib/reelsApi";
import {
  clearVideoQualityPref,
  loadVideoQualityPref,
  qualitiesForVideo,
  saveVideoQualityPref,
  type ReelsVideoQuality,
} from "@/lib/reelsVideoQuality";
import { reelsWatchPlayerSize, reelsWatchTopInset } from "@/lib/reelsWatchLayout";

const SCREEN_W = Dimensions.get("window").width;
const THUMB_H = Math.round((SCREEN_W * 9) / 16);
const DESC_PREVIEW_LEN = 90;

function formatUploadDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function WatchPlayerErrorFallback({ resetError }: { resetError: () => void }) {
  return (
    <View style={[styles.player, styles.blockedPlayer]}>
      <Ionicons name="alert-circle-outline" size={40} color="#fff" />
      <Text style={styles.blockedTitle}>Playback error</Text>
      <Text style={styles.blockedText}>Switched to Auto quality. Tap retry to continue.</Text>
      <TouchableOpacity style={styles.playerRetryBtn} onPress={resetError} activeOpacity={0.85}>
        <Text style={styles.playerRetryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ReelsWatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const [video, setVideo] = useState<ReelsVideo | null>(null);
  const [channel, setChannel] = useState<ReelsChannel | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [related, setRelated] = useState<ReelsVideo[]>([]);
  const [comments, setComments] = useState<{ id: number; content: string; displayName: string; createdAt: string }[]>([]);
  const [commentText, setCommentText] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [metaRefreshing, setMetaRefreshing] = useState(false);
  const [playAllowed, setPlayAllowed] = useState(true);
  const [playBlockReasons, setPlayBlockReasons] = useState<string[]>([]);
  const [descOpen, setDescOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [videoQuality, setVideoQuality] = useState<ReelsVideoQuality>("auto");
  const [adBreaks, setAdBreaks] = useState<ReelsAdBreaks | null>(null);
  const [watchPhase, setWatchPhase] = useState<"loading" | "pre-roll" | "content" | "mid-roll">("loading");
  const [preRollIndex, setPreRollIndex] = useState(0);
  const preRollIndexRef = useRef(0);
  const [activeMidRoll, setActiveMidRoll] = useState<ReelsMidRollBreak | null>(null);
  const [contentResumeAt, setContentResumeAt] = useState(0);
  const triggeredMidRollsRef = useRef(new Set<number>());
  const watchedRef = useRef(0);
  const viewSentRef = useRef(false);
  const watchTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playbackUrl = video?.videoUrl ?? null;
  const switchingVideo = Boolean(video && id && String(video.id) !== String(id));

  const qualityOptions = useMemo(
    () => qualitiesForVideo(video?.sourceHeight, video?.videoUrl),
    [video?.sourceHeight, video?.videoUrl],
  );

  useEffect(() => {
    if (!video?.id) return;
    const opts = qualitiesForVideo(video.sourceHeight, video.videoUrl);
    void loadVideoQualityPref(video.id, opts).then(setVideoQuality);
  }, [video?.id, video?.sourceHeight, video?.videoUrl]);

  const resetVideoQuality = useCallback((videoId: number) => {
    setVideoQuality("auto");
    void clearVideoQualityPref(videoId);
  }, []);

  const handleQualityChange = useCallback((q: ReelsVideoQuality) => {
    if (!video?.id) return;
    setVideoQuality(q);
    void saveVideoQualityPref(video.id, q);
  }, [video?.id]);

  const handlePlaybackError = useCallback(() => {
    if (!video?.id) return;
    resetVideoQuality(video.id);
    Alert.alert(
      "Quality not available",
      "This video could not play at the selected quality. Switched back to Auto.",
    );
  }, [video?.id, resetVideoQuality]);

  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });
  }, []);

  const reportAdResult = useCallback(async (
    ad: ReelsAdBreakItem,
    placement: string,
    result: { watchedSeconds: number; skipped: boolean; completed: boolean },
  ) => {
    if (!user?.dbId || !id || ad.id <= 0) return;
    await recordReelsAdImpression({
      creativeId: ad.id,
      contentVideoId: Number(id),
      userId: user.dbId,
      placement,
      watchedSeconds: result.watchedSeconds,
      skipped: result.skipped,
      completed: result.completed,
    }, user.sessionToken);
  }, [id, user?.dbId, user?.sessionToken]);

  const handlePreRollFinished = useCallback(async (
    ad: ReelsAdBreakItem,
    result: { watchedSeconds: number; skipped: boolean; completed: boolean },
  ) => {
    await reportAdResult(ad, "pre_roll", result);
    const next = preRollIndexRef.current + 1;
    if (adBreaks && next < adBreaks.preRoll.length) {
      preRollIndexRef.current = next;
      setPreRollIndex(next);
      return;
    }
    setWatchPhase("content");
  }, [adBreaks, reportAdResult]);

  const handleMidRollFinished = useCallback(async (
    ad: ReelsAdBreakItem,
    result: { watchedSeconds: number; skipped: boolean; completed: boolean },
  ) => {
    await reportAdResult(ad, "mid_roll", result);
    setActiveMidRoll(null);
    setWatchPhase("content");
  }, [reportAdResult]);

  const handleContentProgress = useCallback((seconds: number) => {
    if (!adBreaks?.enabled || watchPhase !== "content" || !adBreaks.midRoll.length) return;
    for (const mid of adBreaks.midRoll) {
      if (triggeredMidRollsRef.current.has(mid.offsetSeconds)) continue;
      if (seconds >= mid.offsetSeconds) {
        triggeredMidRollsRef.current.add(mid.offsetSeconds);
        setContentResumeAt(seconds);
        setActiveMidRoll(mid);
        setWatchPhase("mid-roll");
        break;
      }
    }
  }, [adBreaks, watchPhase]);

  const load = useCallback(async () => {
    if (!user?.dbId || !id) return;
    viewSentRef.current = false;
    watchedRef.current = 0;
    triggeredMidRollsRef.current.clear();
    setPreRollIndex(0);
    preRollIndexRef.current = 0;
    setActiveMidRoll(null);
    setContentResumeAt(0);
    setWatchPhase("loading");

    const res = await fetchReelsVideo(Number(id), user.dbId, user.sessionToken);
    if (res.success && res.video) {
      setVideo(res.video);
      setPlayAllowed(res.playAllowed !== false);
      setPlayBlockReasons(res.playBlockReasons ?? []);
      if (res.video.channelHandle) {
        const ch = await fetchReelsChannel(res.video.channelHandle, user.dbId, user.sessionToken);
        setChannel(ch.channel ?? null);
        setSubscribed(Boolean(ch.channel?.isSubscribed));
      } else {
        setChannel(null);
      }
    }

    const feed = await fetchReelsFeed(user.dbId, null, user.sessionToken);
    const currentId = Number(id);
    const list = (feed.videos ?? []).filter((v) => v.id !== currentId);
    const sameChannel = list.filter((v) => v.channelId === res.video?.channelId);
    const other = list.filter((v) => v.channelId !== res.video?.channelId);
    setRelated([...sameChannel, ...other].slice(0, 20));

    const cm = await fetchReelsComments(Number(id), user.sessionToken);
    if (cm.success) setComments(cm.comments ?? []);

    const ads = await fetchReelsAdBreaks(Number(id), user.dbId, user.sessionToken);
    if (ads.success !== false) {
      setAdBreaks(ads);
      if (ads.enabled && ads.preRoll.length > 0) {
        setWatchPhase("pre-roll");
      } else {
        setWatchPhase("content");
      }
    } else {
      setAdBreaks({ enabled: false, preRoll: [], midRoll: [] });
      setWatchPhase("content");
    }

    setInitialLoading(false);
    setMetaRefreshing(false);
  }, [id, user?.dbId, user?.sessionToken]);

  useEffect(() => {
    setMetaRefreshing(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (watchTickRef.current) clearInterval(watchTickRef.current);
    watchTickRef.current = setInterval(() => {
      if (watchPhase === "content" && !switchingVideo && video && String(video.id) === String(id)) {
        watchedRef.current += 1;
      }
    }, 1000);
    return () => {
      if (watchTickRef.current) clearInterval(watchTickRef.current);
      if (!viewSentRef.current && user?.dbId && id && watchedRef.current > 2) {
        viewSentRef.current = true;
        void recordReelsView(Number(id), user.dbId, watchedRef.current, user.sessionToken);
      }
    };
  }, [id, user?.dbId, user?.sessionToken, switchingVideo, video, watchPhase]);

  const refreshVideoMeta = useCallback(async () => {
    if (!user?.dbId || !id) return;
    setMetaRefreshing(true);
    const res = await fetchReelsVideo(Number(id), user.dbId, user.sessionToken);
    if (res.success && res.video) {
      setVideo(res.video);
      setPlayAllowed(res.playAllowed !== false);
      setPlayBlockReasons(res.playBlockReasons ?? []);
    }
    setMetaRefreshing(false);
  }, [id, user?.dbId, user?.sessionToken]);

  const toggleReaction = async (reaction: "like" | "dislike") => {
    if (!user?.dbId || !video) return;
    await reactReelsVideo(video.id, user.dbId, reaction, user.sessionToken);
    void refreshVideoMeta();
  };

  const toggleSubscribe = async () => {
    if (!user?.dbId || !video) return;
    if (subscribed) {
      await unsubscribeReelsChannel(video.channelId, user.dbId, user.sessionToken);
      setSubscribed(false);
    } else {
      await subscribeReelsChannel(video.channelId, user.dbId, user.sessionToken);
      setSubscribed(true);
    }
  };

  const sendComment = async () => {
    if (!user?.dbId || !commentText.trim() || !id) return;
    await postReelsComment(Number(id), user.dbId, commentText.trim(), user.sessionToken);
    setCommentText("");
    const cm = await fetchReelsComments(Number(id), user.sessionToken);
    if (cm.success) setComments(cm.comments ?? []);
    if (video) setVideo({ ...video, commentCount: video.commentCount + 1 });
  };

  const shareVideo = async () => {
    if (!video || !user?.dbId) return;
    await shareReelsVideo(video.id, user.dbId, user.sessionToken);
    const msg = `${video.title}\n@${video.channelHandle}`;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(video.videoUrl, { dialogTitle: msg }).catch(() => {});
    } else {
      Alert.alert("Share", msg);
    }
  };

  const openRelated = (v: ReelsVideo) => {
    router.replace({ pathname: "/reels/watch/[id]", params: { id: String(v.id) } });
  };

  const channelLabel = useCallback(
    (v: ReelsVideo) => v.channelDisplayName ?? (v.channelHandle ? `@${v.channelHandle}` : "Channel"),
    [],
  );

  const descPreview = useMemo(() => {
    if (!video?.description) return "";
    const d = video.description.trim();
    if (d.length <= DESC_PREVIEW_LEN) return d;
    return `${d.slice(0, DESC_PREVIEW_LEN).trim()}…`;
  }, [video?.description]);

  const hasLongDesc = (video?.description?.trim().length ?? 0) > DESC_PREVIEW_LEN;

  const renderRelated = ({ item }: { item: ReelsVideo }) => (
    <TouchableOpacity style={styles.ytCard} onPress={() => openRelated(item)} activeOpacity={0.9}>
      <View style={styles.thumbWrap}>
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} contentFit="cover" recyclingKey={String(item.id)} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder, { backgroundColor: colors.muted }]}>
            <Ionicons name="videocam" size={36} color={colors.mutedForeground} />
          </View>
        )}
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
        </View>
      </View>
      <View style={styles.infoRow}>
        {item.channelAvatarUrl ? (
          <Image
            source={{ uri: item.channelAvatarUrl }}
            style={styles.channelAvatar}
            contentFit="cover"
            cacheKey={`ch-avatar-${item.channelId}-${item.channelAvatarUrl}`}
          />
        ) : (
          <View style={[styles.channelAvatar, { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }]}>
            <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 12 }}>
              {(item.channelHandle ?? "?")[0]?.toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.infoText}>
          <Text style={[styles.ytTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.ytMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {channelLabel(item)} · {formatViewCount(item.viewCount)} views
            {item.createdAt ? ` · ${formatTimeAgo(item.createdAt)}` : ""}
          </Text>
        </View>
        <Ionicons name="ellipsis-vertical" size={16} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );

  if (initialLoading && !video) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!video) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Video not found</Text>
      </View>
    );
  }

  const displayChannel = video.channelDisplayName ?? `@${video.channelHandle}`;
  const showPreRoll = playAllowed && watchPhase === "pre-roll" && adBreaks?.preRoll[preRollIndex];
  const showMidRoll = playAllowed && watchPhase === "mid-roll" && activeMidRoll;
  const showContent = playAllowed && playbackUrl && watchPhase === "content";

  const watchTopPad = reelsWatchTopInset(insets);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: watchTopPad }]}>
      <View style={styles.playerWrap}>
        {showPreRoll ? (
          <ReelsAdPlayer
            key={`pre-${adBreaks!.preRoll[preRollIndex].id}-${preRollIndex}`}
            ad={adBreaks!.preRoll[preRollIndex]}
            onFinished={(result) => void handlePreRollFinished(adBreaks!.preRoll[preRollIndex], result)}
          />
        ) : showMidRoll ? (
          <ReelsAdPlayer
            key={`mid-${activeMidRoll!.ad.id}-${activeMidRoll!.offsetSeconds}`}
            ad={activeMidRoll!.ad}
            onFinished={(result) => void handleMidRollFinished(activeMidRoll!.ad, result)}
          />
        ) : showContent ? (
          <ErrorBoundary
            key={`watch-player-${video.id}-${videoQuality}-${contentResumeAt}`}
            FallbackComponent={WatchPlayerErrorFallback}
            onError={() => {
              resetVideoQuality(video.id);
            }}
          >
            <ReelsWatchPlayer
              videoId={video.id}
              baseUrl={playbackUrl}
              quality={videoQuality}
              qualities={qualityOptions}
              durationSeconds={video.durationSeconds}
              paused={switchingVideo || metaRefreshing}
              onBack={() => router.back()}
              hasNext={related.length > 0}
              onNext={() => related[0] && openRelated(related[0])}
              onQualityChange={handleQualityChange}
              onPlaybackError={handlePlaybackError}
              onContentProgress={handleContentProgress}
              contentStartAt={contentResumeAt}
            />
          </ErrorBoundary>
        ) : playAllowed && playbackUrl && watchPhase === "loading" ? (
          <View style={[styles.player, styles.blockedPlayer]}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : !playAllowed ? (
          <View style={[styles.player, styles.blockedPlayer]}>
            <Ionicons name="shield-checkmark-outline" size={40} color="#fff" />
            <Text style={styles.blockedTitle}>
              {video.moderationStatus === "rejected" || video.status === "removed" ? "Video blocked" : "Under safety review"}
            </Text>
            <Text style={styles.blockedText}>
              {video.moderationReason ?? playBlockReasons.join(" · ") ?? "This video is not public yet."}
            </Text>
          </View>
        ) : null}
        {(switchingVideo || metaRefreshing) && watchPhase === "content" ? (
          <View style={styles.playerLoadingOverlay}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : null}
      </View>

      <FlatList
        data={related}
        keyExtractor={(v) => String(v.id)}
        renderItem={renderRelated}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Text style={[styles.vTitle, { color: colors.foreground }]}>{video.title}</Text>

            <Text style={[styles.metaLine, { color: colors.mutedForeground }]}>
              {formatViewCount(video.viewCount)} views
              {video.createdAt ? ` · ${formatTimeAgo(video.createdAt)}` : ""}
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionScroll} contentContainerStyle={styles.actionRow}>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => video.channelHandle && router.push({ pathname: "/reels/channel/[handle]", params: { handle: video.channelHandle } })}
              >
                {video.channelAvatarUrl ? (
                  <Image
                    source={{ uri: video.channelAvatarUrl }}
                    style={styles.chipAvatar}
                    cacheKey={`ch-avatar-${video.channelId}-${video.channelAvatarUrl}`}
                  />
                ) : (
                  <View style={[styles.chipAvatar, { backgroundColor: colors.primary }]} />
                )}
                <Text style={[styles.chipText, { color: colors.foreground }]} numberOfLines={1}>
                  {displayChannel}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.chip,
                  subscribed
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: colors.background, borderColor: colors.foreground },
                ]}
                onPress={toggleSubscribe}
              >
                <Ionicons
                  name={subscribed ? "notifications" : "notifications-outline"}
                  size={16}
                  color={subscribed ? "#fff" : colors.foreground}
                />
                <Text style={[styles.chipText, { color: subscribed ? "#fff" : colors.foreground }]}>
                  {subscribed ? "Subscribed" : "Subscribe"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => toggleReaction("like")}>
                <Ionicons
                  name={video.myReaction === "like" ? "thumbs-up" : "thumbs-up-outline"}
                  size={16}
                  color={video.myReaction === "like" ? colors.primary : colors.foreground}
                />
                <Text style={[styles.chipText, { color: colors.foreground }]}>{formatViewCount(video.likeCount)}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => toggleReaction("dislike")}>
                <Ionicons
                  name={video.myReaction === "dislike" ? "thumbs-down" : "thumbs-down-outline"}
                  size={16}
                  color={colors.foreground}
                />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={shareVideo}>
                <Ionicons name="share-outline" size={16} color={colors.foreground} />
                <Text style={[styles.chipText, { color: colors.foreground }]}>Share</Text>
              </TouchableOpacity>
            </ScrollView>

            {video.description ? (
              <TouchableOpacity style={styles.descPreview} onPress={() => setDescOpen(true)} activeOpacity={0.8}>
                <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }} numberOfLines={2}>
                  {descPreview}
                  {hasLongDesc ? (
                    <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}> more</Text>
                  ) : null}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.commentsBar, { borderColor: colors.border }]}
              onPress={() => setCommentsOpen(true)}
            >
              <Text style={[styles.commentsBarTitle, { color: colors.foreground }]}>Comments</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold" }}>
                {formatViewCount(video.commentCount)}
              </Text>
              <View style={{ flex: 1 }} />
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Description bottom sheet (YouTube-style) */}
      <Modal visible={descOpen} transparent animationType="slide" onRequestClose={() => setDescOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetScrim} onPress={() => setDescOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Description</Text>
              <TouchableOpacity onPress={() => setDescOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={26} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              <Text style={[styles.sheetVideoTitle, { color: colors.foreground }]}>{video.title}</Text>

              <View style={styles.statTiles}>
                <View style={[styles.statTile, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statNum, { color: colors.foreground }]}>{formatViewCount(video.likeCount)}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Likes</Text>
                </View>
                <View style={[styles.statTile, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statNum, { color: colors.foreground }]}>{formatViewCount(video.viewCount)}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Views</Text>
                </View>
                <View style={[styles.statTile, { backgroundColor: colors.card }]}>
                  <Text style={[styles.statNum, { color: colors.foreground }]}>{formatTimeAgo(video.createdAt)}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Uploaded</Text>
                </View>
              </View>

              {channel ? (
                <TouchableOpacity
                  style={[styles.sheetChannel, { borderColor: colors.border }]}
                  onPress={() => {
                    setDescOpen(false);
                    video.channelHandle && router.push({ pathname: "/reels/channel/[handle]", params: { handle: video.channelHandle } });
                  }}
                >
                  {channel.avatarUrl ? (
                    <Image source={{ uri: channel.avatarUrl }} style={styles.sheetChannelAvatar} />
                  ) : (
                    <View style={[styles.sheetChannelAvatar, { backgroundColor: colors.primary }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 15 }}>
                      {channel.displayName ?? `@${channel.handle}`}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                      {formatViewCount(channel.subscriberCount)} subscribers
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.sheetSubBtn,
                      subscribed
                        ? { backgroundColor: colors.primary, borderWidth: 0 }
                        : { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.foreground },
                    ]}
                    onPress={toggleSubscribe}
                  >
                    <Text
                      style={{
                        color: subscribed ? "#fff" : colors.foreground,
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 13,
                      }}
                    >
                      {subscribed ? "Subscribed" : "Subscribe"}
                    </Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ) : null}

              <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 22, marginTop: 16 }}>
                {video.description}
              </Text>

              {video.hashtags && video.hashtags.length > 0 ? (
                <View style={styles.hashtagRow}>
                  {video.hashtags.map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => router.push({ pathname: "/reels/hashtag/[tag]", params: { tag: t } })}
                    >
                      <Text style={{ color: colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" }}>
                        #{t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <View style={[styles.detailRow, { borderTopColor: colors.border }]}>
                <Ionicons name="calendar-outline" size={18} color={colors.mutedForeground} />
                <Text style={{ color: colors.foreground, marginLeft: 12 }}>{formatUploadDate(video.createdAt)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="eye-outline" size={18} color={colors.mutedForeground} />
                <Text style={{ color: colors.foreground, marginLeft: 12 }}>{formatViewCount(video.viewCount)} views</Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="thumbs-up-outline" size={18} color={colors.mutedForeground} />
                <Text style={{ color: colors.foreground, marginLeft: 12 }}>{formatViewCount(video.likeCount)} likes</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Comments bottom sheet */}
      <DismissibleModal visible={commentsOpen} onClose={() => setCommentsOpen(false)} animationType="slide">
        <View style={styles.sheetRoot}>
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 8, marginTop: "auto" }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Comments</Text>
              <TouchableOpacity onPress={() => setCommentsOpen(false)}>
                <Ionicons name="close" size={26} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <View style={[styles.commentInputRow, { borderColor: colors.border }]}>
              <TextInput
                style={[styles.commentInput, { color: colors.foreground }]}
                placeholder="Add a comment..."
                placeholderTextColor={colors.mutedForeground}
                value={commentText}
                onChangeText={setCommentText}
              />
              <TouchableOpacity onPress={sendComment} disabled={!commentText.trim()}>
                <Ionicons name="send" size={22} color={commentText.trim() ? colors.primary : colors.muted} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={comments}
              keyExtractor={(c) => String(c.id)}
              style={{ maxHeight: 360 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
              ListEmptyComponent={
                <Text style={{ color: colors.mutedForeground, textAlign: "center", padding: 24 }}>No comments yet</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{item.displayName}</Text>
                  <Text style={{ color: colors.foreground, marginTop: 2 }}>{item.content}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4 }}>
                    {formatTimeAgo(item.createdAt)}
                  </Text>
                </View>
              )}
            />
          </View>
        </View>
      </DismissibleModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  playerWrap: { position: "relative", backgroundColor: "#000" },
  player: reelsWatchPlayerSize,
  playerLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  blockedPlayer: { alignItems: "center", justifyContent: "center", padding: 20 },
  blockedTitle: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16, marginTop: 12 },
  blockedText: { color: "#ccc", textAlign: "center", marginTop: 8, fontSize: 13 },
  playerRetryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#00A884",
  },
  playerRetryText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  headerBlock: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 },
  vTitle: { fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  metaLine: { fontSize: 13, marginTop: 6 },
  actionScroll: { marginTop: 12 },
  actionRow: { flexDirection: "row", gap: 8, paddingRight: 12 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 180,
  },
  chipAvatar: { width: 24, height: 24, borderRadius: 12 },
  chipText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  descPreview: { marginTop: 12, paddingVertical: 4 },
  commentsBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentsBarTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
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
  ytMeta: { fontSize: 12, marginTop: 4 },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88%",
    paddingTop: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetVideoTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", lineHeight: 22, marginBottom: 14 },
  statTiles: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statTile: { flex: 1, borderRadius: 10, padding: 12, alignItems: "center" },
  statNum: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 2 },
  sheetChannel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sheetChannelAvatar: { width: 44, height: 44, borderRadius: 22 },
  sheetSubBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  hashtagRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  commentInput: { flex: 1, fontSize: 15 },
  commentItem: { marginBottom: 16 },
});
