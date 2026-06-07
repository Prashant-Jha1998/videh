import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  GestureResponderEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { reelsWatchPlayerSize } from "@/lib/reelsWatchLayout";
import { formatDuration } from "@/lib/reelsApi";
import {
  applyQualityToPlaybackUrl,
  qualityLabel,
  type ReelsVideoQuality,
} from "@/lib/reelsVideoQuality";

const DOUBLE_TAP_MS = 320;
const SEEK_SECONDS = 10;
const CONTROLS_HIDE_MS = 4000;
const YT_RED = "#FF0000";

type Props = {
  videoId: number;
  baseUrl: string;
  quality: ReelsVideoQuality;
  sourceHeight?: number | null;
  qualities: ReelsVideoQuality[];
  durationSeconds?: number;
  paused?: boolean;
  onBack?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onQualityChange: (q: ReelsVideoQuality) => void;
  onPlaybackError?: () => void;
  onContentProgress?: (seconds: number) => void;
  contentStartAt?: number;
};

type SurfaceProps = {
  playbackUrl: string;
  paused: boolean;
  durationSeconds?: number;
  onBack?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  onOpenQuality: () => void;
  onPlaybackError?: () => void;
  onContentProgress?: (seconds: number) => void;
  contentStartAt?: number;
};

function formatPlayerClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Remounts cleanly when playbackUrl changes (quality switch). */
function ReelsVideoPlayerSurface({
  playbackUrl,
  paused,
  durationSeconds = 0,
  onBack,
  hasPrevious = false,
  hasNext = false,
  onPrevious,
  onNext,
  onOpenQuality,
  onPlaybackError,
  onContentProgress,
  contentStartAt = 0,
}: SurfaceProps) {
  const insets = useSafeAreaInsets();
  const videoViewRef = useRef<VideoView>(null);
  const player = useVideoPlayer(playbackUrl, (p) => {
    p.loop = false;
    p.muted = false;
    p.volume = 1;
    p.timeUpdateEventInterval = 0.25;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const playingEvent = useEvent(player, "playingChange", { isPlaying: player.playing });
  const isPlaying = playingEvent.isPlaying ?? player.playing;
  const timeEvent = useEvent(player, "timeUpdate", { currentTime: player.currentTime });
  const currentTime = timeEvent.currentTime ?? player.currentTime ?? 0;
  const totalDuration = player.duration > 0 ? player.duration : durationSeconds;
  const progress = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;

  const autoPlayedRef = useRef(false);
  const seekedStartRef = useRef(false);
  const errorHandledRef = useRef(false);
  const lastTapRef = useRef<{ side: "left" | "right"; at: number } | null>(null);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressWidthRef = useRef(0);
  const [skipHint, setSkipHint] = useState<{ side: "left" | "right"; seconds: number } | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
  }, []);

  const scheduleHideControls = useCallback(() => {
    clearHideTimer();
    hideControlsTimerRef.current = setTimeout(() => {
      if (player.playing) setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, [clearHideTimer, player]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (player.playing) scheduleHideControls();
    else clearHideTimer();
  }, [player, scheduleHideControls, clearHideTimer]);

  useFocusEffect(
    useCallback(() => () => {
      try {
        player.pause();
      } catch { /* player may already be released */ }
    }, [player]),
  );

  useEffect(() => () => {
    try {
      player.pause();
    } catch { /* ignore */ }
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    clearHideTimer();
  }, [player, clearHideTimer]);

  useEffect(() => {
    autoPlayedRef.current = false;
    errorHandledRef.current = false;
    seekedStartRef.current = false;
    setControlsVisible(false);
  }, [playbackUrl, contentStartAt]);

  useEffect(() => {
    if (onContentProgress) onContentProgress(currentTime);
  }, [currentTime, onContentProgress]);

  useEffect(() => {
    if (contentStartAt <= 0 || seekedStartRef.current) return;
    if (status === "readyToPlay") {
      seekedStartRef.current = true;
      player.currentTime = contentStartAt;
    }
  }, [status, contentStartAt, player]);

  useEffect(() => {
    if (status !== "error" || errorHandledRef.current) return;
    errorHandledRef.current = true;
    onPlaybackError?.();
  }, [status, onPlaybackError]);

  useEffect(() => {
    if (paused) {
      player.pause();
      return;
    }
    if (status === "readyToPlay" && !autoPlayedRef.current) {
      autoPlayedRef.current = true;
      player.play();
    }
  }, [paused, status, player]);

  useEffect(() => {
    if (!isPlaying) {
      setControlsVisible(true);
      clearHideTimer();
      return;
    }
    if (controlsVisible) scheduleHideControls();
  }, [isPlaying, controlsVisible, clearHideTimer, scheduleHideControls]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      player.pause();
      setControlsVisible(true);
      clearHideTimer();
      return;
    }
    player.play();
    revealControls();
  }, [isPlaying, player, revealControls, clearHideTimer]);

  const seekToRatio = useCallback((ratio: number) => {
    if (totalDuration <= 0) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    player.currentTime = clamped * totalDuration;
    revealControls();
  }, [player, totalDuration, revealControls]);

  const flashSkipHint = useCallback((side: "left" | "right", seconds: number) => {
    setSkipHint({ side, seconds });
    hintOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(hintOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(hintOpacity, { toValue: 0, duration: 520, delay: 280, useNativeDriver: true }),
    ]).start(() => setSkipHint(null));
  }, [hintOpacity]);

  const handleSidePress = useCallback((side: "left" | "right") => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.side === side && now - last.at <= DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      player.seekBy(side === "right" ? SEEK_SECONDS : -SEEK_SECONDS);
      flashSkipHint(side, SEEK_SECONDS);
      revealControls();
      return;
    }
    lastTapRef.current = { side, at: now };
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => {
      if (lastTapRef.current?.side === side) {
        lastTapRef.current = null;
        togglePlayPause();
      }
    }, DOUBLE_TAP_MS + 40);
  }, [player, flashSkipHint, revealControls, togglePlayPause]);

  const handleCenterPress = useCallback(() => {
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.at <= DOUBLE_TAP_MS) return;
    togglePlayPause();
  }, [togglePlayPause]);

  const handleProgressPress = useCallback((e: GestureResponderEvent) => {
    if (progressWidthRef.current <= 0) return;
    seekToRatio(e.nativeEvent.locationX / progressWidthRef.current);
  }, [seekToRatio]);

  const enterFullscreen = useCallback(() => {
    void videoViewRef.current?.enterFullscreen().catch(() => {});
    revealControls();
  }, [revealControls]);

  const showOverlay = controlsVisible || !isPlaying;
  const showCenterTransport = !isPlaying;

  return (
    <>
      <VideoView
        ref={videoViewRef}
        style={styles.player}
        player={player}
        contentFit="contain"
        nativeControls={false}
        fullscreenOptions={{ enable: true, orientation: "landscape" }}
      />

      <View style={styles.tapLayer} pointerEvents="box-none">
        <Pressable style={styles.tapLeft} onPress={() => handleSidePress("left")} />
        <Pressable style={styles.tapCenter} onPress={handleCenterPress} />
        <Pressable style={styles.tapRight} onPress={() => handleSidePress("right")} />
      </View>

      {showOverlay ? (
        <View style={styles.controlsLayer} pointerEvents="box-none">
          <View style={[styles.topBar, { paddingTop: 8 }]} pointerEvents="box-none">
            {onBack ? (
              <TouchableOpacity style={styles.topIconBtn} onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-down" size={28} color="#fff" />
              </TouchableOpacity>
            ) : (
              <View style={styles.topIconBtn} />
            )}
            <View style={styles.topBarRight}>
              <TouchableOpacity style={styles.topIconBtn} onPress={onOpenQuality} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="settings-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {showCenterTransport ? (
            <View style={styles.centerTransport} pointerEvents="box-none">
              <TouchableOpacity
                style={[styles.sideTransportBtn, !hasPrevious && styles.transportDisabled]}
                onPress={hasPrevious ? onPrevious : undefined}
                disabled={!hasPrevious}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="play-skip-back" size={34} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.mainPlayBtn}
                onPress={togglePlayPause}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <Ionicons name={isPlaying ? "pause" : "play"} size={52} color="#fff" style={styles.playIconOffset} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sideTransportBtn, !hasNext && styles.transportDisabled]}
                onPress={hasNext ? onNext : undefined}
                disabled={!hasNext}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="play-skip-forward" size={34} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.bottomControls} pointerEvents="box-none">
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>
                {formatPlayerClock(currentTime)}
                {" / "}
                {totalDuration > 0 ? formatPlayerClock(totalDuration) : formatDuration(durationSeconds)}
              </Text>
              <TouchableOpacity onPress={enterFullscreen} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="expand-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <Pressable
              style={styles.progressTrackHit}
              onPress={handleProgressPress}
              onLayout={(e) => {
                progressWidthRef.current = e.nativeEvent.layout.width;
              }}
            >
              <View style={styles.progressTrack}>
                <View style={[styles.progressPlayed, { width: `${progress * 100}%` }]} />
                <View style={[styles.progressThumb, { left: `${progress * 100}%` }]} />
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}

      {skipHint ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.skipHint,
            skipHint.side === "left" ? styles.skipHintLeft : styles.skipHintRight,
            { opacity: hintOpacity },
          ]}
        >
          <Ionicons
            name={skipHint.side === "left" ? "play-back" : "play-forward"}
            size={28}
            color="#fff"
          />
          <Text style={styles.skipHintText}>{skipHint.seconds} sec</Text>
        </Animated.View>
      ) : null}
    </>
  );
}

function ReelsWatchPlayerInner({
  videoId,
  baseUrl,
  quality,
  qualities,
  durationSeconds,
  paused = false,
  onBack,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onQualityChange,
  onPlaybackError,
  onContentProgress,
  contentStartAt,
}: Props) {
  const playbackUrl = applyQualityToPlaybackUrl(baseUrl, quality);
  const [qualityOpen, setQualityOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const handlePlaybackError = useCallback(() => {
    onPlaybackError?.();
  }, [onPlaybackError]);

  const activeQualityLabel = quality === "auto" ? "Auto" : qualityLabel(quality);

  return (
    <View style={styles.wrap}>
      <ReelsVideoPlayerSurface
        key={`${videoId}-${quality}`}
        playbackUrl={playbackUrl}
        paused={paused}
        durationSeconds={durationSeconds}
        onBack={onBack}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onPrevious={onPrevious}
        onNext={onNext}
        onOpenQuality={() => setQualityOpen(true)}
        onPlaybackError={handlePlaybackError}
        onContentProgress={onContentProgress}
        contentStartAt={contentStartAt}
      />

      <Modal visible={qualityOpen} transparent animationType="slide" onRequestClose={() => setQualityOpen(false)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetScrim} onPress={() => setQualityOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              Quality for current video
              {quality !== "auto" ? (
                <Text style={styles.sheetTitleActive}> · {qualityLabel(quality)}</Text>
              ) : null}
            </Text>
            {qualities.map((q) => {
              const selected = q === quality;
              return (
                <TouchableOpacity
                  key={String(q)}
                  style={styles.qualityRow}
                  onPress={() => {
                    onQualityChange(q);
                    setQualityOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.qualityRowText, selected && styles.qualityRowTextActive]}>
                    {qualityLabel(q)}
                  </Text>
                  {selected ? <Ionicons name="checkmark" size={22} color="#00A884" /> : null}
                </TouchableOpacity>
              );
            })}
            <Text style={styles.sheetFoot}>
              This selection only applies to the current video. Each video remembers its own quality, like YouTube.
              {" "}
              Current: {activeQualityLabel}.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export const ReelsWatchPlayer = React.memo(ReelsWatchPlayerInner);

const styles = StyleSheet.create({
  wrap: { position: "relative", backgroundColor: "#000" },
  player: reelsWatchPlayerSize,
  tapLayer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  tapLeft: { flex: 0.38 },
  tapCenter: { flex: 0.24 },
  tapRight: { flex: 0.38 },
  controlsLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  topIconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  centerTransport: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "38%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
  },
  sideTransportBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  transportDisabled: { opacity: 0.35 },
  mainPlayBtn: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  playIconOffset: { marginLeft: 4 },
  bottomControls: {
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  timeText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  progressTrackHit: {
    height: 22,
    justifyContent: "flex-end",
    paddingBottom: 2,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
    overflow: "visible",
  },
  progressPlayed: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: YT_RED,
    borderRadius: 2,
  },
  progressThumb: {
    position: "absolute",
    top: -4,
    width: 11,
    height: 11,
    marginLeft: -5.5,
    borderRadius: 6,
    backgroundColor: YT_RED,
  },
  skipHint: {
    position: "absolute",
    top: "38%",
    alignItems: "center",
    justifyContent: "center",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  skipHintLeft: { left: "14%" },
  skipHintRight: { right: "14%" },
  skipHintText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13, marginTop: 4 },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ccc",
    alignSelf: "center",
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#111",
    marginBottom: 8,
  },
  sheetTitleActive: { color: "#667781", fontFamily: "Inter_500Medium" },
  qualityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  qualityRowText: { fontSize: 16, fontFamily: "Inter_400Regular", color: "#111" },
  qualityRowTextActive: { fontFamily: "Inter_700Bold", color: "#00A884" },
  sheetFoot: {
    fontSize: 12,
    color: "#667781",
    lineHeight: 17,
    marginTop: 12,
    marginBottom: 4,
  },
});
