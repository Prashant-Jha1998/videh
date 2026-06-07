import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { ReelsAdBreakItem } from "@/lib/reelsApi";
import { reelsWatchPlayerSize } from "@/lib/reelsWatchLayout";

const YT_AD_YELLOW = "#F2C94C";

type Props = {
  ad: ReelsAdBreakItem;
  onFinished: (result: { watchedSeconds: number; skipped: boolean; completed: boolean }) => void;
};

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ReelsAdPlayer({ ad, onFinished }: Props) {
  const player = useVideoPlayer(ad.videoUrl, (p) => {
    p.loop = false;
    p.muted = false;
    p.volume = 1;
    p.timeUpdateEventInterval = 0.25;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const timeEvent = useEvent(player, "timeUpdate", { currentTime: player.currentTime });
  const currentTime = timeEvent.currentTime ?? player.currentTime ?? 0;

  const finishedRef = useRef(false);
  const currentTimeRef = useRef(0);
  const onFinishedRef = useRef<Props["onFinished"]>(() => {});

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const duration = player.duration > 0 ? player.duration : ad.durationSeconds;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const remaining = Math.max(0, Math.ceil(duration - currentTime));

  const finish = useCallback((skipped: boolean, completed: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      player.pause();
    } catch { /* ignore */ }
    onFinishedRef.current({
      watchedSeconds: Math.round(currentTimeRef.current),
      skipped,
      completed,
    });
  }, [player]);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    finishedRef.current = false;
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
    if (duration > 0 && currentTime >= duration - 0.35) {
      finish(false, true);
    }
  }, [currentTime, duration, finish]);

  const canSkip = ad.adType === "skippable"
    && ad.skipAfterSeconds != null
    && currentTime >= ad.skipAfterSeconds;

  const skipCountdown = ad.adType === "skippable" && ad.skipAfterSeconds != null && !canSkip
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

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="none">
          <View style={styles.adBadge}>
            <Text style={styles.adBadgeText}>Ad</Text>
          </View>
          <Text style={styles.advertiser} numberOfLines={1}>{ad.advertiserName}</Text>
          <Text style={styles.topTimer}>{remaining}s</Text>
        </View>

        <View style={styles.bottomPanel} pointerEvents="box-none">
          {ad.adType === "non_skippable" ? (
            <Text style={styles.afterHint} pointerEvents="none">
              Video will play after ad
            </Text>
          ) : null}

          <View style={styles.bottomRow} pointerEvents="box-none">
            <View style={styles.timeBlock} pointerEvents="none">
              <Text style={styles.timeText}>
                {formatClock(currentTime)}
                {" / "}
                {formatClock(duration)}
              </Text>
            </View>

            {canSkip ? (
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => finish(true, false)}
                activeOpacity={0.85}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.skipBtnText}>Skip ad</Text>
                <Ionicons name="play-forward" size={15} color="#111" />
              </TouchableOpacity>
            ) : skipCountdown != null && skipCountdown > 0 ? (
              <View style={styles.skipWait} pointerEvents="none">
                <Text style={styles.skipWaitText}>Skip in {skipCountdown}s</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.progressTrack} pointerEvents="none">
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            <View style={[styles.progressThumb, { left: `${progress * 100}%` }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", backgroundColor: "#000", ...reelsWatchPlayerSize },
  player: { width: "100%", height: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  adBadge: {
    backgroundColor: YT_AD_YELLOW,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
  },
  adBadgeText: { color: "#111", fontFamily: "Inter_700Bold", fontSize: 11 },
  advertiser: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  topTimer: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    minWidth: 28,
    textAlign: "right",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomPanel: {
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  afterHint: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 8,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  timeBlock: { flex: 1 },
  timeText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  skipBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.15)",
    elevation: 3,
  },
  skipBtnText: { color: "#111", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  skipWait: {
    backgroundColor: "rgba(0,0,0,0.62)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  skipWaitText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
    overflow: "visible",
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: YT_AD_YELLOW,
    borderRadius: 2,
  },
  progressThumb: {
    position: "absolute",
    top: -4,
    width: 11,
    height: 11,
    marginLeft: -5.5,
    borderRadius: 6,
    backgroundColor: YT_AD_YELLOW,
  },
});
