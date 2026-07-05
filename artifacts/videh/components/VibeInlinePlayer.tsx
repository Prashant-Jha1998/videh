import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { filterOverlayColor, type VideoEditorMetadata } from "@/lib/videoEditor";
import { recordReelsView } from "@/lib/reelsApi";

type Props = {
  videoId: number;
  videoUrl: string;
  durationSeconds: number;
  userId?: number;
  sessionToken?: string | null;
  isActive: boolean;
  /** Pause while comments sheet is open. */
  playbackSuppressed?: boolean;
  preload?: boolean;
  posterUrl?: string | null;
  editorMetadata?: VideoEditorMetadata | null;
};

export function VibeInlinePlayer({
  videoId,
  videoUrl,
  durationSeconds,
  userId,
  sessionToken,
  isActive,
  playbackSuppressed = false,
  preload = false,
  posterUrl,
  editorMetadata,
}: Props) {
  const safeUrl = videoUrl && videoUrl.trim().length > 0 ? videoUrl : null;
  const player = useVideoPlayer(safeUrl, (p) => {
    if (!p) return;
    try {
      p.loop = true;
      p.muted = false;
      p.timeUpdateEventInterval = 1;
      p.bufferOptions = {
        preferredForwardBufferDuration: 12,
        automaticallyWaitsToMinimizeStalling: true,
      };
    } catch { /* ignore */ }
  });
  const statusEvent = useEvent(player, "statusChange", { status: player?.status ?? "idle" });
  const timeEvent = useEvent(player, "timeUpdate", {
    currentTime: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: 0,
    bufferedPosition: 0,
  });
  const currentTime = timeEvent?.currentTime ?? 0;
  const viewSentRef = useRef(false);
  const lastActiveRef = useRef(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPoster, setShowPoster] = useState(true);
  const [tapPaused, setTapPaused] = useState(false);
  const [hintIcon, setHintIcon] = useState<"play" | "pause" | null>(null);
  const [screenFocused, setScreenFocused] = useState(true);

  const status = statusEvent?.status ?? player?.status ?? "idle";
  const isReady = status === "readyToPlay";
  const isLoading = status === "loading" || status === "idle";
  const effectiveDuration = Math.max(1, Number(durationSeconds) || 1);
  const shouldPlay = isActive && screenFocused && isReady && !playbackSuppressed && !tapPaused;

  const stopPlayback = useCallback(() => {
    if (!player) return;
    try {
      player.pause();
      player.muted = true;
      player.volume = 0;
    } catch { /* ignore */ }
  }, [player]);

  const startPlayback = useCallback(() => {
    if (!player) return;
    try {
      player.muted = false;
      player.volume = 1;
      player.play();
    } catch { /* ignore */ }
  }, [player]);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => {
        setScreenFocused(false);
        stopPlayback();
      };
    }, [stopPlayback]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        stopPlayback();
      }
    });
    return () => sub.remove();
  }, [stopPlayback]);

  useEffect(() => {
    setTapPaused(false);
    setHintIcon(null);
  }, [videoId]);

  useEffect(() => {
    if (!player) return;
    if (shouldPlay) {
      setShowPoster(false);
      startPlayback();
    } else {
      stopPlayback();
      if (!isActive || !screenFocused) setShowPoster(true);
    }
    lastActiveRef.current = isActive && screenFocused;
  }, [shouldPlay, isActive, screenFocused, player, startPlayback, stopPlayback]);

  useEffect(() => {
    viewSentRef.current = false;
  }, [videoId]);

  useEffect(() => {
    if (!preload || !player || isActive) return;
    stopPlayback();
  }, [preload, player, isActive, stopPlayback]);

  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      stopPlayback();
    };
  }, [stopPlayback]);

  useEffect(() => {
    if (!isActive || !screenFocused || !userId || viewSentRef.current) return;
    const watched = Math.floor(currentTime);
    if (watched >= Math.min(3, effectiveDuration)) {
      viewSentRef.current = true;
      void recordReelsView(videoId, userId, watched, sessionToken).catch(() => { /* ignore */ });
    }
  }, [isActive, screenFocused, userId, sessionToken, videoId, effectiveDuration, currentTime]);

  const flashHint = (icon: "play" | "pause") => {
    setHintIcon(icon);
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHintIcon(null), 550);
  };

  const onVideoTap = () => {
    if (!isActive || playbackSuppressed || !isReady) return;
    setTapPaused((prev) => {
      const next = !prev;
      flashHint(next ? "pause" : "play");
      return next;
    });
  };

  const filterTint = editorMetadata?.filter ? filterOverlayColor(editorMetadata.filter) : null;
  const overlays = editorMetadata?.textOverlays ?? [];

  if (!safeUrl || !player) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      <Pressable style={StyleSheet.absoluteFill} onPress={onVideoTap} accessibilityLabel="Play or pause video" />
      {(showPoster && isLoading) && posterUrl ? (
        <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} contentFit="contain" pointerEvents="none" />
      ) : null}
      {isActive && isLoading ? (
        <View style={styles.buffering} pointerEvents="none">
          <ActivityIndicator color="#fff" size="small" />
        </View>
      ) : null}
      {hintIcon ? (
        <View style={styles.hintWrap} pointerEvents="none">
          <View style={styles.hintCircle}>
            <Ionicons name={hintIcon} size={38} color="#fff" />
          </View>
        </View>
      ) : null}
      {status === "error" ? (
        <View style={styles.error}>
          <Text style={styles.errorText}>Could not play</Text>
        </View>
      ) : null}
      {filterTint ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: filterTint }]} pointerEvents="none" />
      ) : null}
      {overlays.map((o) => (
        <Text
          key={o.id}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: `${o.x * 100}%`,
            top: `${o.y * 100}%`,
            color: o.color,
            fontSize: o.fontSize,
            fontFamily: "Inter_700Bold",
            textShadowColor: "rgba(0,0,0,0.6)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 3,
            maxWidth: "80%",
          }}
        >
          {o.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  buffering: {
    position: "absolute",
    top: "45%",
    alignSelf: "center",
  },
  hintWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  hintCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  error: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  errorText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
});
