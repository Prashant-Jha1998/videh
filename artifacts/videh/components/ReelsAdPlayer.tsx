import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import * as Linking from "expo-linking";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef } from "react";
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ReelsAdDetailPanel } from "@/components/ReelsAdDetailPanel";
import { useColors } from "@/hooks/useColors";
import type { ReelsAdBreakItem } from "@/lib/reelsApi";
import { recordReelsAdClick } from "@/lib/reelsApi";

const YT_AD_YELLOW = "#F2C94C";

type Props = {
  ad: ReelsAdBreakItem;
  contentVideoId?: number;
  userId?: number;
  sessionToken?: string | null;
  onFinished: (result: { watchedSeconds: number; skipped: boolean; completed: boolean }) => void;
};

function primaryDestination(ad: ReelsAdBreakItem): string | null {
  if (Platform.OS === "ios" && ad.appStoreUrl) return ad.appStoreUrl;
  if (ad.playStoreUrl) return ad.playStoreUrl;
  if (ad.destinationUrl) return ad.destinationUrl;
  return null;
}

function learnMoreDestination(ad: ReelsAdBreakItem): string | null {
  return ad.destinationUrl ?? primaryDestination(ad);
}

export function ReelsAdPlayer({
  ad,
  contentVideoId = 0,
  userId,
  sessionToken,
  onFinished,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const videoHeight = Math.round(Math.min(screenWidth * (9 / 16), screenWidth * 0.56));
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

  const trackClick = async (clickTarget: "cta" | "play_store" | "app_store" | "destination") => {
    if (!userId || ad.id <= 0) return;
    await recordReelsAdClick(
      {
        creativeId: ad.id,
        userId,
        placement: ad.placement,
        clickTarget,
      },
      sessionToken,
    );
  };

  const openUrl = async (url: string | null | undefined, clickTarget: "cta" | "play_store" | "app_store" | "destination") => {
    if (!url) {
      Alert.alert("Ad", "No link available for this ad.");
      return;
    }
    void trackClick(clickTarget);
    await Linking.openURL(url).catch(() => {
      Alert.alert("Ad", url);
    });
  };

  const onVisitAdvertiser = () => {
    void openUrl(learnMoreDestination(ad), "destination");
  };

  const onLearnMore = () => {
    void openUrl(learnMoreDestination(ad), "destination");
  };

  const onInstall = () => {
    const isApp = ad.format === "app_install" || ad.playStoreUrl || ad.appStoreUrl;
    if (isApp) {
      const url = Platform.OS === "ios" ? ad.appStoreUrl ?? ad.playStoreUrl : ad.playStoreUrl ?? ad.appStoreUrl;
      void openUrl(url, Platform.OS === "ios" && ad.appStoreUrl ? "app_store" : "play_store");
      return;
    }
    void openUrl(primaryDestination(ad), "cta");
  };

  return (
    <View style={styles.root}>
      <View style={[styles.videoSection, { height: videoHeight }]}>
        <VideoView
          style={styles.player}
          player={player}
          contentFit="contain"
          nativeControls={false}
        />

        <View style={styles.videoOverlay} pointerEvents="box-none">
          <View style={[styles.topRow, { paddingTop: Math.max(6, insets.top > 0 ? 0 : 6) }]} pointerEvents="box-none">
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={onVisitAdvertiser} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.visitAdvertiser}>Visit advertiser</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bottomBlock} pointerEvents="box-none">
            <View style={styles.bottomVideoRow} pointerEvents="box-none">
              <TouchableOpacity
                style={styles.sponsoredRow}
                onPress={() => Alert.alert("Videh Ads", "This ad is served through ads.videh.co.in — Videh's advertising platform for creators and businesses.")}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.sponsoredText}>{ad.sponsoredLabel ?? "Sponsored"}</Text>
                <Ionicons name="information-circle-outline" size={14} color="#fff" />
              </TouchableOpacity>

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
              ) : ad.adType === "non_skippable" ? (
                <View style={styles.skipWait} pointerEvents="none">
                  <Text style={styles.skipWaitText}>Ad · {Math.max(0, Math.ceil(duration - currentTime))}s</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.progressTrack} pointerEvents="none">
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>
        </View>
      </View>

      <ReelsAdDetailPanel
        ad={ad}
        colors={colors}
        onLearnMore={onLearnMore}
        onInstall={onInstall}
        onHide={() => finish(true, false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  videoSection: { position: "relative", backgroundColor: "#000", width: "100%" },
  player: { width: "100%", height: "100%" },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    zIndex: 2,
  },
  bottomBlock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  visitAdvertiser: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomVideoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  sponsoredRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  sponsoredText: {
    color: "#fff",
    fontSize: 12,
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
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  progressFill: {
    height: 3,
    backgroundColor: YT_AD_YELLOW,
  },
});
