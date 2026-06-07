import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ReelsAdBreakItem } from "@/lib/reelsApi";

type Props = {
  ad: ReelsAdBreakItem;
  onFinished: (result: { watchedSeconds: number; skipped: boolean; completed: boolean }) => void;
};

export function ReelsAdPlayer({ ad, onFinished }: Props) {
  const player = useVideoPlayer(ad.videoUrl, (p) => {
    p.loop = false;
    p.muted = false;
    p.volume = 1;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const timeEvent = useEvent(player, "timeUpdate", { currentTime: player.currentTime });
  const currentTime = timeEvent.currentTime ?? 0;
  const finishedRef = useRef(false);
  const [countdown, setCountdown] = useState(ad.durationSeconds);

  const finish = useCallback((skipped: boolean, completed: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try { player.pause(); } catch { /* ignore */ }
    onFinished({
      watchedSeconds: Math.round(currentTime),
      skipped,
      completed,
    });
  }, [currentTime, onFinished, player]);

  useEffect(() => {
    finishedRef.current = false;
    setCountdown(ad.durationSeconds);
  }, [ad.id, ad.videoUrl, ad.durationSeconds]);

  useEffect(() => {
    if (status === "readyToPlay") {
      player.play();
    }
    if (status === "playToEnd") {
      finish(false, true);
    }
    if (status === "error") {
      finish(false, false);
    }
  }, [status, player, finish]);

  useEffect(() => {
    const remaining = Math.max(0, Math.ceil(ad.durationSeconds - currentTime));
    setCountdown(remaining);
    if (currentTime >= ad.durationSeconds - 0.5) {
      finish(false, true);
    }
  }, [currentTime, ad.durationSeconds, finish]);

  const canSkip = ad.adType === "skippable"
    && ad.skipAfterSeconds != null
    && currentTime >= ad.skipAfterSeconds;

  const skipHint = ad.adType === "skippable" && ad.skipAfterSeconds != null && !canSkip
    ? Math.max(0, Math.ceil(ad.skipAfterSeconds - currentTime))
    : null;

  return (
    <View style={styles.wrap}>
      <VideoView
        style={styles.player}
        player={player}
        contentFit="contain"
        nativeControls={false}
      />

      <View style={styles.topBar} pointerEvents="box-none">
        <View style={styles.adPill}>
          <Text style={styles.adPillText}>Ad</Text>
        </View>
        <Text style={styles.advertiser} numberOfLines={1}>{ad.advertiserName}</Text>
        <View style={styles.countdownPill}>
          <Text style={styles.countdownText}>
            {ad.adType === "non_skippable" ? `${countdown}s` : canSkip ? "" : `${countdown}s`}
          </Text>
        </View>
      </View>

      {ad.adType === "non_skippable" ? (
        <View style={styles.bottomHint}>
          <Text style={styles.bottomHintText}>Video will play after ad</Text>
        </View>
      ) : null}

      {canSkip ? (
        <TouchableOpacity style={styles.skipBtn} onPress={() => finish(true, false)} activeOpacity={0.88}>
          <Text style={styles.skipText}>Skip ad</Text>
          <Ionicons name="play-forward" size={16} color="#111" />
        </TouchableOpacity>
      ) : skipHint != null && skipHint > 0 ? (
        <View style={styles.skipWait}>
          <Text style={styles.skipWaitText}>Skip in {skipHint}s</Text>
        </View>
      ) : null}

      <Pressable style={styles.blockTap} onPress={() => { /* block accidental taps */ }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", backgroundColor: "#000", width: "100%", aspectRatio: 16 / 9 },
  player: { width: "100%", height: "100%" },
  topBar: {
    position: "absolute",
    top: 8,
    left: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adPill: {
    backgroundColor: "#F2C94C",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  adPillText: { color: "#111", fontFamily: "Inter_700Bold", fontSize: 11 },
  advertiser: { flex: 1, color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  countdownPill: { minWidth: 32, alignItems: "flex-end" },
  countdownText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  bottomHint: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    alignItems: "center",
  },
  bottomHintText: { color: "rgba(255,255,255,0.75)", fontSize: 12 },
  skipBtn: {
    position: "absolute",
    bottom: 16,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  skipText: { color: "#111", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  skipWait: {
    position: "absolute",
    bottom: 16,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  skipWaitText: { color: "#fff", fontSize: 12 },
  blockTap: { ...StyleSheet.absoluteFillObject },
});
