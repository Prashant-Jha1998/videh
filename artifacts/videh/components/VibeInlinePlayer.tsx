import { useEvent } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { filterOverlayColor, type VideoEditorMetadata } from "@/lib/videoEditor";
import { recordReelsView } from "@/lib/reelsApi";

type Props = {
  videoId: number;
  videoUrl: string;
  durationSeconds: number;
  userId?: number;
  sessionToken?: string | null;
  isActive: boolean;
  /** Buffer next clip without playing it. */
  preload?: boolean;
  posterUrl?: string | null;
  editorMetadata?: VideoEditorMetadata | null;
  musicTitle?: string | null;
};

export function VibeInlinePlayer({
  videoId,
  videoUrl,
  durationSeconds,
  userId,
  sessionToken,
  isActive,
  preload = false,
  posterUrl,
  editorMetadata,
  musicTitle,
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
  const bufferedPosition = timeEvent?.bufferedPosition ?? 0;
  const viewSentRef = useRef(false);
  const lastActiveRef = useRef(false);
  const [showPoster, setShowPoster] = useState(true);

  const status = statusEvent?.status ?? player?.status ?? "idle";
  const isReady = status === "readyToPlay";
  const isBuffering = isActive && (!isReady || (currentTime > 0 && bufferedPosition - currentTime < 0.35));
  const effectiveDuration = Math.max(1, Number(durationSeconds) || 1);

  useEffect(() => {
    if (!player) return;
    if (isActive && isReady) {
      setShowPoster(false);
      if (!lastActiveRef.current) viewSentRef.current = false;
      try { player.play(); } catch { /* ignore */ }
    } else {
      try { player.pause(); } catch { /* ignore */ }
      if (!isActive) setShowPoster(true);
    }
    lastActiveRef.current = isActive;
  }, [isActive, isReady, player]);

  useEffect(() => {
    if (!preload || !player || isActive) return;
    try { player.pause(); } catch { /* ignore */ }
  }, [preload, player, isActive]);

  useEffect(() => {
    return () => {
      try { player?.pause(); } catch { /* ignore */ }
    };
  }, [player]);

  useEffect(() => {
    if (!isActive || !userId || viewSentRef.current) return;
    const watched = Math.floor(currentTime);
    if (watched >= Math.min(3, effectiveDuration)) {
      viewSentRef.current = true;
      void recordReelsView(videoId, userId, watched, sessionToken).catch(() => { /* ignore */ });
    }
  }, [isActive, userId, sessionToken, videoId, effectiveDuration, currentTime]);

  const filterTint = editorMetadata?.filter ? filterOverlayColor(editorMetadata.filter) : null;
  const overlays = editorMetadata?.textOverlays ?? [];
  const caption = editorMetadata?.caption?.trim();

  if (!safeUrl || !player) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      {(showPoster || isBuffering) && posterUrl ? (
        <Image source={{ uri: posterUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : null}
      {isActive && isBuffering ? (
        <View style={styles.buffering} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
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
      {caption ? (
        <View style={styles.caption} pointerEvents="none">
          <Text style={styles.captionText} numberOfLines={2}>{caption}</Text>
        </View>
      ) : null}
      {musicTitle ? (
        <View style={styles.music} pointerEvents="none">
          <Text style={styles.musicText} numberOfLines={1}>♪ {musicTitle}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  buffering: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  error: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  errorText: { color: "#fff", fontFamily: "Inter_600SemiBold" },
  caption: {
    position: "absolute",
    left: 14,
    right: 80,
    bottom: 100,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  captionText: { color: "#fff", fontSize: 13 },
  music: {
    position: "absolute",
    top: 56,
    left: 14,
    right: 80,
  },
  musicText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
