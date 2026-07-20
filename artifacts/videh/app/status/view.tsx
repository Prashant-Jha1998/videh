import { Ionicons } from "@expo/vector-icons";
import { useEvent, useEventListener } from "expo";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DismissibleModal } from "@/components/DismissibleModal";
import { useApp } from "@/context/AppContext";
import type { Status } from "@/context/AppContext";
import { useChatKeyboard } from "@/hooks/useChatKeyboard";
import { mapApiStatusRow } from "@/lib/statusReply";
import { getApiUrl } from "@/lib/api";
import { resolvePublicAssetUrl, withStatusMediaAuth } from "@/lib/publicAssetUrl";
import { saveStatusToGalleryWithAlert } from "@/lib/saveStatusToLibrary";
import { usePlayableAudioUri } from "@/lib/usePlayableAudioUri";
import { useInstantStatusMediaUri, getCachedAuthMediaFile } from "@/lib/useCachedAuthMediaUri";
import { usePlayableVideoUri } from "@/lib/usePlayableVideoUri";
import { authFetchHeaders } from "@/lib/authenticatedMedia";
import Svg, { Path } from "react-native-svg";

const { width: W, height: H } = Dimensions.get("window");
const DEFAULT_IMAGE_STORY_MS = 8000;
const DEFAULT_TEXT_STORY_MS = 5000;
const DEFAULT_VIDEO_STORY_MS = 8000;

function strokeToPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  return points.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function normalizeStoryTrimMs(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  // Some Android pickers report duration in seconds instead of milliseconds.
  if (value < 1000) return Math.round(value * 1000);
  return Math.round(value);
}

function VideoStatusPlayerSurface({
  uri,
  sessionToken,
  paused,
  trimStartMs,
  trimEndMs,
  onReady,
  onLoadError,
  onProgress,
  onEnded,
}: {
  uri: string;
  sessionToken?: string | null;
  paused: boolean;
  trimStartMs?: number;
  trimEndMs?: number;
  onReady: () => void;
  onLoadError: () => void;
  onProgress: (ratio: number) => void;
  onEnded: () => void;
}) {
  const readyNotifiedRef = useRef(false);
  const endedRef = useRef(false);
  const startMs = normalizeStoryTrimMs(trimStartMs) ?? 0;
  const endMs = normalizeStoryTrimMs(trimEndMs);
  const videoSource = useMemo(() => {
    if (
      sessionToken
      && uri.startsWith("http")
      && uri.includes("/api/statuses/media/")
    ) {
      return {
        uri,
        headers: authFetchHeaders(sessionToken) as Record<string, string>,
      };
    }
    return uri;
  }, [uri, sessionToken]);
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop = false;
    p.muted = false;
    p.volume = 1;
    p.timeUpdateEventInterval = 0.1;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const timeUpdate = useEvent(player, "timeUpdate", {
    currentTime: player.currentTime,
  });

  useEffect(() => {
    readyNotifiedRef.current = false;
    endedRef.current = false;
  }, [uri]);

  useEffect(() => {
    if (status === "error") onLoadError();
  }, [status, onLoadError]);

  useEffect(() => {
    if (status !== "readyToPlay" || readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    if (startMs > 0) player.currentTime = startMs / 1000;
    onReady();
    if (!paused) player.play();
  }, [status, startMs, paused, player, onReady]);

  useEffect(() => {
    if (status !== "readyToPlay") return;
    if (paused) player.pause();
    else player.play();
  }, [paused, status, player]);

  const finishClip = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    try { player.pause(); } catch { /* ignore */ }
    onProgress(1);
    onEnded();
  }, [player, onProgress, onEnded]);

  useEffect(() => {
    if (status !== "readyToPlay" || paused || endedRef.current) return;
    const currentMs = (timeUpdate.currentTime ?? player.currentTime ?? 0) * 1000;
    const durationSec = player.duration;
    const naturalEndMs = Number.isFinite(durationSec) && durationSec > 0
      ? durationSec * 1000
      : DEFAULT_VIDEO_STORY_MS;
    const clipEndMs = endMs ?? naturalEndMs;
    const span = Math.max(250, clipEndMs - startMs);
    const ratio = Math.max(0, Math.min(1, (currentMs - startMs) / span));
    onProgress(ratio);
    if (currentMs >= clipEndMs - 40) finishClip();
  }, [
    timeUpdate.currentTime,
    status,
    paused,
    player,
    startMs,
    endMs,
    onProgress,
    finishClip,
  ]);

  useEventListener(player, "playToEnd", finishClip);

  return (
    <VideoView
      player={player}
      style={{ width: W, height: H * 0.78 }}
      contentFit="contain"
      nativeControls={false}
    />
  );
}

function VideoStatusPlayer({
  uri,
  sessionToken,
  paused,
  trimStartMs,
  trimEndMs,
  onLoadError,
  onReady,
  onProgress,
  onEnded,
}: {
  uri: string;
  sessionToken?: string | null;
  paused: boolean;
  trimStartMs?: number;
  trimEndMs?: number;
  onLoadError: () => void;
  onReady: () => void;
  onProgress: (ratio: number) => void;
  onEnded: () => void;
}) {
  const { playableUri, failed, loading } = usePlayableVideoUri(uri, sessionToken);

  useEffect(() => {
    if (failed) onLoadError();
  }, [failed, onLoadError]);

  if (loading) {
    return (
      <View style={styles.mediaLoading}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }
  if (!playableUri) {
    return null;
  }

  return (
    <VideoStatusPlayerSurface
      key={uri}
      uri={playableUri}
      sessionToken={sessionToken}
      paused={paused}
      trimStartMs={trimStartMs}
      trimEndMs={trimEndMs}
      onReady={onReady}
      onLoadError={onLoadError}
      onProgress={onProgress}
      onEnded={onEnded}
    />
  );
}

function StoryImage({
  uri,
  sessionToken,
  onError,
}: {
  uri: string;
  sessionToken?: string | null;
  onError: () => void;
}) {
  const { displayUri, failed, loading } = useInstantStatusMediaUri(uri, sessionToken, "image");

  useEffect(() => {
    if (failed) onError();
  }, [failed, onError]);

  if (loading) {
    return (
      <View style={styles.mediaLoading}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }
  if (!displayUri) return null;

  return (
    <Image
      source={{ uri: displayUri }}
      style={{ width: W, height: H * 0.78 }}
      contentFit="contain"
      onError={onError}
    />
  );
}

function StoryMusicPlayer({ uri, sessionToken, paused }: { uri?: string; sessionToken?: string | null; paused: boolean }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const { playbackSource, failed } = usePlayableAudioUri(uri, sessionToken);
  useEffect(() => {
    if (!playbackSource || failed) return;
    let mounted = true;
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
    Audio.Sound.createAsync(playbackSource, { shouldPlay: !paused, isLooping: true, volume: 0.8 })
      .then(({ sound: s }) => {
        if (!mounted) {
          void s.unloadAsync();
          return;
        }
        soundRef.current = s;
      })
      .catch(() => {});
    return () => {
      mounted = false;
      if (soundRef.current) void soundRef.current.unloadAsync();
      soundRef.current = null;
    };
  }, [playbackSource, failed]);
  useEffect(() => {
    if (!soundRef.current) return;
    if (paused) void soundRef.current.pauseAsync();
    else void soundRef.current.playAsync();
  }, [paused, playbackSource]);
  return null;
}

const BASE_URL = getApiUrl();

const REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

const MENU_ITEMS = [
  { label: "Message", icon: "chatbubble-outline", action: "message" as const },
  { label: "Voice call", icon: "call-outline", action: "voice" as const },
  { label: "Video call", icon: "videocam-outline", action: "video" as const },
  { label: "View contact", icon: "person-outline", action: "contact" as const },
  { label: "Report", icon: "flag-outline", action: "report" as const },
];

export default function ViewStatusScreen() {
  const params = useLocalSearchParams<{ ids?: string; id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { keyboardVisible } = useChatKeyboard();
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
  const [mediaLoadFailed, setMediaLoadFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [fetchedStatuses, setFetchedStatuses] = useState<Record<string, Status>>({});

  const statusCatalog = useMemo(() => {
    const map = new Map(statuses.map((s) => [s.id, s]));
    Object.values(fetchedStatuses).forEach((s) => map.set(s.id, s));
    return map;
  }, [statuses, fetchedStatuses]);

  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const pausedProgressRef = useRef(0);
  const videoDrivenRef = useRef(false);
  const mediaLoadFailedRef = useRef(false);
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;
  const statusCatalogRef = useRef(statusCatalog);
  statusCatalogRef.current = statusCatalog;
  const longPressActiveRef = useRef(false);
  const longPressConsumedRef = useRef(false);
  const wasPausedBeforeHoldRef = useRef(false);
  const currentIdxRef = useRef(currentIdx);
  currentIdxRef.current = currentIdx;

  const currentStatus = statusCatalog.get(ids[currentIdx]);

  useEffect(() => {
    if (!user?.dbId) return;
    const missing = ids.filter((id) => !statusCatalog.has(id));
    if (!missing.length) return;
    const headers: Record<string, string> = {};
    if (user.sessionToken) headers.Authorization = `Bearer ${user.sessionToken}`;
    missing.forEach((id) => {
      fetch(`${BASE_URL}/api/statuses/${id}/reply-context?viewerId=${user.dbId}`, { headers })
        .then((r) => r.json())
        .then((data: { success?: boolean; status?: Record<string, unknown> }) => {
          if (!data.success || !data.status) return;
          const mapped = mapApiStatusRow(
            data.status,
            user.dbId!,
            user.name,
            user.avatar,
            user.sessionToken,
          );
          setFetchedStatuses((prev) => ({ ...prev, [id]: mapped }));
        })
        .catch(() => {});
    });
  }, [ids.join(","), statuses, fetchedStatuses, user?.dbId, user?.sessionToken, user?.name, user?.avatar]);
  const resolvedMediaUrl = currentStatus?.mediaUrl
    ? (withStatusMediaAuth(currentStatus.mediaUrl, user?.sessionToken, currentStatus.id)
      ?? resolvePublicAssetUrl(currentStatus.mediaUrl)
      ?? currentStatus.mediaUrl)
    : undefined;
  const isMyStatus = currentStatus?.userId === "me";
  const isMedia = currentStatus?.type === "image" || currentStatus?.type === "video";
  const isVideoStory = currentStatus?.type === "video";
  const isBoostedStory = Boolean(currentStatus?.isBoosted);
  const editorData = currentStatus?.editorData;

  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  }, []);

  // Mark viewed + fetch data when status changes (only the current item, not the whole carousel)
  useEffect(() => {
    if (!currentStatus || !user?.dbId) return;
    if (!isMyStatus) {
      markStatusViewedLocally(currentStatus.id);
      fetch(`${BASE_URL}/api/statuses/${currentStatus.id}/view`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
        },
        body: JSON.stringify({ viewerId: user.dbId }),
      }).catch(() => {});
      // Reset reaction for new status
      setMyReaction(null);
      setShowReactions(false);
    }
    if (isMyStatus) {
      fetch(`${BASE_URL}/api/statuses/${currentStatus.id}/viewers?ownerId=${user.dbId}`, {
        headers: user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : undefined,
      })
        .then((r) => r.json())
        .then((data) => { if (data.success) { setViewCount(data.viewCount ?? 0); setReactionSummary(data.reactions ?? {}); } })
        .catch(() => {});
    }
  }, [currentStatus?.id, isMyStatus, user?.dbId, markStatusViewedLocally]);

  const currentStoryId = ids[currentIdx];
  const currentStoryType = currentStatus?.type;
  const currentStoryTrimEndMs = currentStatus?.editorData?.trimEndMs;
  const currentStoryTrimStartMs = currentStatus?.editorData?.trimStartMs;

  const goNext = useCallback(() => {
    animRef.current?.stop();
    videoDrivenRef.current = false;
    if (currentIdxRef.current < ids.length - 1) setCurrentIdx((i) => i + 1);
    else router.back();
  }, [ids.length, router]);

  const goPrev = useCallback(() => {
    animRef.current?.stop();
    videoDrivenRef.current = false;
    if (currentIdxRef.current > 0) setCurrentIdx((i) => i - 1);
    else {
      progress.setValue(0);
      pausedProgressRef.current = 0;
    }
  }, [progress]);

  // Image/text stories: timed progress. Video stories: driven by player callbacks.
  const startAnim = useCallback((idx: number, fromValue = 0) => {
    const status = statusCatalogRef.current.get(ids[idx]);
    if (status?.type === "video" && !mediaLoadFailedRef.current) {
      // Video progress is synced from VideoStatusPlayer onProgress / onEnded.
      videoDrivenRef.current = true;
      progress.setValue(fromValue);
      return;
    }
    videoDrivenRef.current = false;
    progress.setValue(fromValue);
    const duration = (status?.type === "image" || status?.type === "video"
      ? DEFAULT_IMAGE_STORY_MS
      : DEFAULT_TEXT_STORY_MS) * (1 - fromValue);
    if (duration <= 0) return;
    const anim = Animated.timing(progress, { toValue: 1, duration, useNativeDriver: false });
    animRef.current = anim;
    anim.start(({ finished }) => {
      if (!finished) return;
      if (idx < ids.length - 1) setCurrentIdx(idx + 1);
      else router.back();
    });
  }, [ids, progress, router]);

  useEffect(() => {
    animRef.current?.stop();
    pausedProgressRef.current = 0;
    progress.setValue(0);
    setPaused(false);
    const waitingForVideo = currentStoryType === "video"
      && Boolean(resolvedMediaUrl)
      && !videoReady
      && !mediaLoadFailed;
    if (waitingForVideo) return;
    startAnim(currentIdx);
    return () => animRef.current?.stop();
  }, [
    currentIdx,
    currentStoryId,
    currentStoryType,
    currentStoryTrimEndMs,
    currentStoryTrimStartMs,
    videoReady,
    mediaLoadFailed,
    resolvedMediaUrl,
    startAnim,
    progress,
  ]);

  useEffect(() => {
    mediaLoadFailedRef.current = false;
    setMediaLoadFailed(false);
    setVideoReady(false);
  }, [currentStatus?.id, currentStatus?.mediaUrl]);

  useEffect(() => {
    mediaLoadFailedRef.current = mediaLoadFailed;
  }, [mediaLoadFailed]);

  // Prefetch next story media so the next item starts instantly.
  useEffect(() => {
    const next = statusCatalog.get(ids[currentIdx + 1]);
    const url = next?.mediaUrl;
    if (!url || !user?.sessionToken) return;
    if (next.type !== "image" && next.type !== "video") return;
    void getCachedAuthMediaFile(
      withStatusMediaAuth(url, user.sessionToken, next.id) ?? resolvePublicAssetUrl(url) ?? url,
      user.sessionToken,
      next.type === "video" ? "mp4" : "jpg",
    ).catch(() => {});
  }, [currentIdx, ids, statusCatalog, user?.sessionToken]);

  // Unblock story if video never becomes ready (network / codec edge cases).
  useEffect(() => {
    if (currentStoryType !== "video" || !resolvedMediaUrl || videoReady || mediaLoadFailed) return;
    const timer = setTimeout(() => setVideoReady(true), 8000);
    return () => clearTimeout(timer);
  }, [currentIdx, currentStoryType, resolvedMediaUrl, videoReady, mediaLoadFailed]);

  const pauseStory = useCallback(() => {
    if (paused) return;
    animRef.current?.stop();
    progress.stopAnimation((value) => {
      if (typeof value === "number") pausedProgressRef.current = Math.max(0, Math.min(1, value));
    });
    setPaused(true);
  }, [paused, progress]);

  const resumeStory = useCallback(() => {
    if (!paused) return;
    setPaused(false);
    if (!videoDrivenRef.current) {
      startAnim(currentIdx, pausedProgressRef.current);
    }
  }, [currentIdx, paused, startAnim]);

  const onVideoProgress = useCallback((ratio: number) => {
    if (!videoDrivenRef.current) return;
    progress.setValue(Math.max(0, Math.min(1, ratio)));
  }, [progress]);

  const onVideoEnded = useCallback(() => {
    goNext();
  }, [goNext]);

  const togglePause = () => {
    if (paused) resumeStory();
    else pauseStory();
  };

  const swipeCloseResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 90 || g.vy > 0.9) router.back();
        },
      }),
    [router],
  );

  const downloadStory = useCallback(async () => {
    if (!currentStatus || downloading) return;
    pauseStory();
    setDownloading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await saveStatusToGalleryWithAlert(currentStatus, user?.sessionToken);
    } finally {
      setDownloading(false);
      resumeStory();
    }
  }, [currentStatus, downloading, pauseStory, resumeStory, user?.sessionToken]);

  const visibleMenuItems = [
    ...(isMedia && resolvedMediaUrl
      ? [{ label: "Download", icon: "download-outline" as const, action: "download" as const }]
      : []),
    ...(!isMyStatus ? MENU_ITEMS : []),
  ];

  const openStatusContactChat = useCallback(async () => {
    if (!currentStatus || !user?.dbId || isMyStatus) return;
    const otherUserId = parseInt(currentStatus.userId, 10);
    if (!Number.isFinite(otherUserId)) return;
    const chatId = await createDirectChat(
      otherUserId,
      currentStatus.userName ?? "Contact",
      currentStatus.userAvatar,
    );
    router.push({ pathname: "/chat/[id]", params: { id: chatId, name: currentStatus.userName ?? "Contact" } });
  }, [createDirectChat, currentStatus, isMyStatus, router, user?.dbId]);

  const startStatusCall = useCallback(async (type: "audio" | "video") => {
    if (!currentStatus || !user?.dbId || isMyStatus) return;
    try {
      const otherUserId = parseInt(currentStatus.userId, 10);
      if (!Number.isFinite(otherUserId)) return;
      const chatId = await createDirectChat(
        otherUserId,
        currentStatus.userName ?? "Contact",
        currentStatus.userAvatar,
      );
      router.push({
        pathname: "/call/[id]",
        params: { id: chatId, name: currentStatus.userName ?? "Contact", type },
      });
    } catch {
      Alert.alert("Error", "Could not start call.");
    }
  }, [createDirectChat, currentStatus, isMyStatus, router, user?.dbId]);

  const handleStatusMenuAction = useCallback(async (action: string) => {
    setShowMenu(false);
    if (action === "download") {
      void downloadStory();
      return;
    }
    resumeStory();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (action === "message") await openStatusContactChat();
      else if (action === "voice") await startStatusCall("audio");
      else if (action === "video") await startStatusCall("video");
      else if (action === "contact") await openStatusContactChat();
      else if (action === "report") {
        const submitReport = (reason: string) => {
          if (!user?.dbId || !currentStatus) return;
          fetch(`${BASE_URL}/api/statuses/${currentStatus.id}/report`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
            },
            body: JSON.stringify({ reporterId: user.dbId, reason, details: reason }),
          })
            .then((r) => r.json())
            .then((d: { success?: boolean }) => {
              Alert.alert(
                d.success ? "Reported" : "Error",
                d.success
                  ? "Thank you. Our team will review this status."
                  : "Could not send report. Try again.",
              );
            })
            .catch(() => Alert.alert("Error", "Could not send report. Try again."));
        };
        Alert.alert(
          "Report status",
          "Tell us why you are reporting this status.",
          [
            { text: "Spam", onPress: () => submitReport("spam") },
            { text: "Inappropriate", onPress: () => submitReport("inappropriate") },
            { text: "Cancel", style: "cancel" },
          ],
        );
      }
    } catch {
      Alert.alert("Error", "Could not complete this action.");
    }
  }, [downloadStory, openStatusContactChat, resumeStory, startStatusCall]);

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
      const replyText = isBoostedStory
        ? `Reply to your boosted story: ${reply.trim()}`
        : reply.trim();
      sendMessage(chatId, replyText, undefined, undefined, {
        statusId: currentStatus.id,
        ownerId: currentStatus.userId === "me" ? String(user.dbId) : currentStatus.userId,
        ownerName: currentStatus.userName ?? "Contact",
        type: currentStatus.type,
        mediaUrl: currentStatus.mediaUrl,
        content: currentStatus.content,
        backgroundColor: currentStatus.backgroundColor,
      });
      setReply("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Replace the story viewer so chat mounts cleanly (avoids nested-stack ErrorBoundary).
      router.replace({ pathname: "/chat/[id]", params: { id: chatId, name: currentStatus.userName ?? "Contact" } });
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
    const headers = {
      "Content-Type": "application/json",
      ...(user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
    };
    if (isSame) {
      fetch(endpoint, { method: "DELETE", headers, body: JSON.stringify({ userId: user.dbId }) }).catch(() => {});
    } else {
      fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ userId: user.dbId, emoji }) }).catch(() => {});
    }
  };

  if (ids.length === 0 || !currentStatus) return null;

  const userInitials = (currentStatus.userName ?? "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const totalReactions = Object.values(reactionSummary).reduce((a, b) => a + b, 0);
  const bgColor = isMedia ? "#000" : (currentStatus.backgroundColor ?? "#059669");

  return (
    <View
      style={[styles.container, { backgroundColor: bgColor, paddingTop: topPad }]}
      {...swipeCloseResponder.panHandlers}
    >
      <StoryMusicPlayer uri={editorData?.musicUri} sessionToken={user?.sessionToken} paused={paused || showMenu} />

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
          {isBoostedStory && !isMyStatus && (
            <View style={styles.sponsoredPill}>
              <Ionicons name="flash" size={10} color="#14131F" />
              <Text style={styles.sponsoredText}>Sponsored</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={togglePause}>
          <Ionicons name={paused ? "play" : "pause"} size={17} color="#fff" />
        </TouchableOpacity>
        {isMedia && resolvedMediaUrl ? (
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => { void downloadStory(); }}
            disabled={downloading}
          >
            {downloading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="download-outline" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.iconBtn} onPress={() => { setShowMenu(true); pauseStory(); }}>
          <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── CONTENT ── (tap left = prev, tap right = next) */}
      <View style={{ flex: 1 }}>
        <Pressable
          style={StyleSheet.absoluteFill}
          delayLongPress={180}
          onLongPress={() => {
            longPressActiveRef.current = true;
            longPressConsumedRef.current = true;
            wasPausedBeforeHoldRef.current = paused;
            pauseStory();
          }}
          onPressOut={() => {
            if (!longPressActiveRef.current) return;
            longPressActiveRef.current = false;
            if (!wasPausedBeforeHoldRef.current && !showMenu) resumeStory();
          }}
          onPress={(e) => {
            if (longPressConsumedRef.current) {
              longPressConsumedRef.current = false;
              return;
            }
            if (showReactions || showMenu) { setShowReactions(false); return; }
            const x = e.nativeEvent.locationX;
            if (x < W * 0.3) goPrev(); else goNext();
          }}
        >
          {isMedia && resolvedMediaUrl ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              {mediaLoadFailed ? (
                <View style={styles.mediaErrorCard}>
                  <Ionicons name="image-outline" size={38} color="rgba(255,255,255,0.78)" />
                  <Text style={styles.mediaErrorTitle}>Could not load this story media</Text>
                  <Text style={styles.mediaErrorHint}>Please check your connection and try again.</Text>
                </View>
              ) : isVideoStory ? (
                <VideoStatusPlayer
                  uri={resolvedMediaUrl}
                  sessionToken={user?.sessionToken}
                  paused={paused || showMenu}
                  trimStartMs={editorData?.trimStartMs}
                  trimEndMs={editorData?.trimEndMs}
                  onLoadError={() => setMediaLoadFailed(true)}
                  onReady={() => setVideoReady(true)}
                  onProgress={onVideoProgress}
                  onEnded={onVideoEnded}
                />
              ) : (
                <StoryImage
                  uri={resolvedMediaUrl}
                  sessionToken={user?.sessionToken}
                  onError={() => setMediaLoadFailed(true)}
                />
              )}
              <Svg style={[StyleSheet.absoluteFill, { top: H * 0.02 }]} pointerEvents="none">
                {(editorData?.strokes ?? []).map((stroke) => (
                  <Path
                    key={stroke.id}
                    d={strokeToPath(stroke.points.map((p) => ({ x: p.x * W, y: p.y * H * 0.78 })))}
                    stroke={stroke.color}
                    strokeWidth={stroke.width}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </Svg>
              {(editorData?.overlays ?? []).map((overlay) => (
                <Text
                  key={overlay.id}
                  style={[
                    styles.storyOverlay,
                    {
                      left: `${overlay.x * 100}%`,
                      top: `${overlay.y * 78}%`,
                      color: overlay.kind === "text" ? overlay.color : "#fff",
                      fontSize: overlay.size,
                    },
                  ]}
                >
                  {overlay.text}
                </Text>
              ))}
              {editorData?.musicName ? (
                <View style={styles.musicPill}>
                  <Ionicons name="musical-notes" size={12} color="#E0DCFF" />
                  <Text style={styles.musicPillText}>{editorData.musicName}</Text>
                </View>
              ) : null}
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
        </Pressable>
      </View>

      {/* ── BOTTOM (sticky above keyboard) ── */}
      <KeyboardStickyView enabled offset={{ closed: 0, opened: 0 }}>
        <View style={[styles.bottomSection, { paddingBottom: keyboardVisible ? 12 : insets.bottom + 12 }]}>

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
                  placeholder={isBoostedStory ? "Reply to this boosted story..." : `Reply to ${currentStatus.userName}...`}
                  placeholderTextColor="rgba(20,19,31,0.45)"
                  cursorColor="#059669"
                  selectionColor="rgba(91,79,232,0.35)"
                  onFocus={pauseStory}
                  onBlur={resumeStory}
                  returnKeyType="send"
                  onSubmitEditing={sendReply}
                  autoCorrect
                  autoCapitalize="sentences"
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
      </KeyboardStickyView>

      {/* ── 3-DOT MENU MODAL ── */}
      <DismissibleModal
        visible={showMenu}
        onClose={() => {
          setShowMenu(false);
          resumeStory();
        }}
        animationType="fade"
      >
        <View style={styles.statusMenuLift}>
          <View style={styles.menuCard}>
            {visibleMenuItems.map((item, idx) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.menuItem, idx < visibleMenuItems.length - 1 && styles.menuItemBorder]}
                onPress={() => { void handleStatusMenuAction(item.action); }}
              >
                <Ionicons name={item.icon as any} size={20} color={item.label === "Report" ? "#e53e3e" : "#14131F"} />
                <Text style={[styles.menuItemText, item.label === "Report" && { color: "#e53e3e" }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </DismissibleModal>
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
  sponsoredPill: { marginTop: 4, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FACC15", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  sponsoredText: { color: "#14131F", fontSize: 10, fontFamily: "Inter_700Bold" },
  // Content
  statusText: { color: "#fff", fontSize: 26, fontFamily: "Inter_600SemiBold", textAlign: "center", lineHeight: 36 },
  mediaErrorCard: { alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 8 },
  mediaErrorTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  mediaErrorHint: { color: "rgba(255,255,255,0.68)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  mediaLoading: { width: W, height: H * 0.78, alignItems: "center", justifyContent: "center" },
  storyOverlay: { position: "absolute", textAlign: "center", fontWeight: "800", textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5, transform: [{ translateX: -60 }, { translateY: -20 }], maxWidth: W * 0.82 },
  musicPill: { position: "absolute", top: 12, left: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  musicPillText: { color: "#E0DCFF", fontSize: 11, fontFamily: "Inter_700Bold", maxWidth: W * 0.7 },
  captionBar: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", padding: 12 },
  captionText: { color: "#fff", fontSize: 15, textAlign: "center" },
  // Bottom
  bottomSection: { paddingHorizontal: 12, gap: 10 },
  reactionPicker: { flexDirection: "row", justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 40, paddingHorizontal: 8, paddingVertical: 6, gap: 2, alignSelf: "flex-end" },
  reactionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  reactionBtnActive: { backgroundColor: "rgba(255,255,255,0.2)", transform: [{ scale: 1.15 }] },
  reactionEmoji: { fontSize: 25 },
  replyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  replyBar: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.94)", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", borderRadius: 50, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  replyInput: { flex: 1, color: "#14131F", fontSize: 15, paddingVertical: 0, minHeight: 22 },
  sendBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#7C6CF0", alignItems: "center", justifyContent: "center" },
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
  statusMenuLift: { flex: 1, justifyContent: "flex-end" },
  menuCard: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 20 },
  menuItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, gap: 16 },
  menuItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#f0f2f5" },
  menuItemText: { fontSize: 16, color: "#14131F", fontFamily: "Inter_400Regular" },
});
