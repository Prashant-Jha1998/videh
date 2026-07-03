import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef } from "react";
import {
  Alert,
  Dimensions,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "@/context/AppContext";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import {
  recordReelsAdClick,
  recordReelsAdImpression,
  type ReelsVibeFeedAd,
} from "@/lib/reelsApi";
import { VIBE_MAX_DURATION_SECONDS } from "@/lib/vibeVideo";

const SCREEN_W = Dimensions.get("window").width;
const VIBE_AD_MAX_SECONDS = VIBE_MAX_DURATION_SECONDS;

type Props = {
  ad: ReelsVibeFeedAd;
  height: number;
  bottomPad: number;
  isActive: boolean;
};

function ctaLabel(ad: ReelsVibeFeedAd): string {
  if (ad.format === "app_install" || ad.ctaType === "install") return "Install";
  if (ad.format === "shopping" || ad.ctaType === "shop_now") return "Shop now";
  if (ad.ctaType === "watch_now") return "Watch now";
  return "Learn more";
}

function isVideoAd(ad: ReelsVibeFeedAd): boolean {
  return Boolean(ad.videoUrl && (ad.format === "shorts_video" || ad.format === "video" || ad.format === "bumper"));
}

function primaryTapTarget(ad: ReelsVibeFeedAd): { target: "cta" | "play_store" | "app_store" | "destination"; url?: string | null } {
  if (ad.format === "app_install") {
    if (Platform.OS === "ios" && ad.appStoreUrl) return { target: "app_store", url: ad.appStoreUrl };
    if (ad.playStoreUrl) return { target: "play_store", url: ad.playStoreUrl };
    if (ad.appStoreUrl) return { target: "app_store", url: ad.appStoreUrl };
  }
  return { target: "destination", url: ad.destinationUrl ?? ad.playStoreUrl ?? ad.appStoreUrl };
}

/** Instagram Reels–style sponsored swipe card (separate from organic Vibe clips). */
export function VibeAdCard({ ad, height, bottomPad, isActive }: Props) {
  const { user } = useApp();
  const { t } = useUiPreferences();
  const impressedRef = useRef(false);
  const currentTimeRef = useRef(0);
  const videoAd = isVideoAd(ad);
  const heroUri = ad.imageUrl ?? ad.videoUrl;
  const brandName = ad.appName ?? ad.headline ?? ad.title;
  const tagline = ad.description?.trim() || ad.advertiserName;
  const maxDuration = Math.min(VIBE_AD_MAX_SECONDS, ad.durationSeconds || VIBE_AD_MAX_SECONDS);
  const safeVideoUrl = videoAd && ad.videoUrl?.trim() ? ad.videoUrl : null;

  const player = useVideoPlayer(safeVideoUrl, (p) => {
    if (!p) return;
    p.loop = false;
    p.muted = false;
    p.volume = 1;
    p.timeUpdateEventInterval = 0.25;
  });
  const { status } = useEvent(player, "statusChange", { status: player?.status ?? "idle" });
  const timeEvent = useEvent(player, "timeUpdate", { currentTime: player?.currentTime ?? 0 });
  const currentTime = timeEvent.currentTime ?? player?.currentTime ?? 0;

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const duration = player && player.duration > 0
    ? Math.min(maxDuration, player.duration)
    : maxDuration;
  const canSkip = ad.adType === "skippable"
    && ad.skipAfterSeconds != null
    && currentTime >= ad.skipAfterSeconds;
  const skipCountdown = ad.adType === "skippable" && ad.skipAfterSeconds != null && !canSkip
    ? Math.max(0, Math.ceil(ad.skipAfterSeconds - currentTime))
    : null;

  const recordImpression = useCallback(async (opts: { watchedSeconds: number; skipped: boolean; completed: boolean }) => {
    if (impressedRef.current || !user?.dbId || ad.id <= 0) return;
    impressedRef.current = true;
    await recordReelsAdImpression(
      {
        creativeId: ad.id,
        contentVideoId: 0,
        userId: user.dbId,
        placement: "vibe_feed",
        watchedSeconds: Math.min(VIBE_AD_MAX_SECONDS, opts.watchedSeconds),
        skipped: opts.skipped,
        completed: opts.completed,
      },
      user.sessionToken,
    );
  }, [ad.id, user?.dbId, user?.sessionToken]);

  const finishVideo = useCallback((skipped: boolean, completed: boolean) => {
    void recordImpression({
      watchedSeconds: Math.round(currentTimeRef.current),
      skipped,
      completed,
    });
    try {
      player?.pause();
    } catch { /* ignore */ }
  }, [player, recordImpression]);

  useEffect(() => {
    if (!videoAd || !player) return;
    if (!isActive) {
      try {
        player.pause();
      } catch { /* ignore */ }
      return;
    }
    impressedRef.current = false;
    if (status === "readyToPlay") {
      try {
        player.currentTime = 0;
        player.play();
      } catch { /* ignore */ }
    }
  }, [isActive, videoAd, player, status, ad.id]);

  useEffect(() => {
    if (!videoAd || !isActive) return;
    if (status === "playToEnd") finishVideo(false, true);
    if (status === "error") finishVideo(false, false);
  }, [status, videoAd, isActive, finishVideo]);

  useEffect(() => {
    if (!videoAd || !isActive || duration <= 0) return;
    if (currentTime >= maxDuration - 0.2 || currentTime >= duration - 0.35) {
      finishVideo(false, true);
    }
  }, [currentTime, duration, maxDuration, videoAd, isActive, finishVideo]);

  useEffect(() => {
    if (videoAd || !isActive) return;
    void recordImpression({ watchedSeconds: 0, skipped: false, completed: false });
  }, [videoAd, isActive, recordImpression]);

  useEffect(() => {
    if (!videoAd || isActive || impressedRef.current) return;
    void recordImpression({
      watchedSeconds: Math.round(currentTimeRef.current),
      skipped: true,
      completed: currentTimeRef.current >= duration * 0.9,
    });
  }, [isActive, videoAd, duration, recordImpression]);

  const onTap = async (target: "cta" | "play_store" | "app_store" | "destination", url?: string | null) => {
    if (user?.dbId && ad.id > 0) {
      await recordReelsAdClick(
        { creativeId: ad.id, userId: user.dbId, placement: "vibe_feed", clickTarget: target },
        user.sessionToken,
      );
    }
    if (url) void Linking.openURL(url);
  };

  const handlePrimary = () => {
    const { target, url } = primaryTapTarget(ad);
    void onTap(target === "destination" ? "cta" : target, url);
  };

  const onAdMenu = () => {
    Alert.alert(brandName, t("reels.adWhyBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("reels.adLearnMore"), onPress: handlePrimary },
      {
        text: t("reels.adVidehAds"),
        onPress: () => void Linking.openURL("https://ads.videh.co.in/").catch(() => {}),
      },
    ]);
  };

  return (
    <View style={[styles.card, { height, backgroundColor: "#000" }]}>
      {videoAd && ad.videoUrl && isActive && player ? (
        <VideoView style={StyleSheet.absoluteFill} player={player} contentFit="cover" nativeControls={false} />
      ) : heroUri ? (
        <Image source={{ uri: heroUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Ionicons name="megaphone-outline" size={48} color="rgba(255,255,255,0.5)" />
        </View>
      )}

      <View style={[styles.topRow, { paddingTop: 56 }]}>
        <TouchableOpacity style={styles.sponsoredPill} onPress={onAdMenu} activeOpacity={0.85}>
          <Text style={styles.sponsoredText}>{ad.sponsoredLabel}</Text>
          <Ionicons name="information-circle-outline" size={13} color="#fff" />
        </TouchableOpacity>
        {videoAd && isActive ? (
          canSkip ? (
            <TouchableOpacity style={styles.skipBtn} onPress={() => finishVideo(true, false)} activeOpacity={0.85}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
          ) : skipCountdown != null && skipCountdown > 0 ? (
            <View style={styles.skipWait}>
              <Text style={styles.skipWaitText}>{skipCountdown}s</Text>
            </View>
          ) : null
        ) : null}
      </View>

      <View style={[styles.sideActions, { bottom: bottomPad + 100 }]}>
        <TouchableOpacity style={styles.sideCta} onPress={handlePrimary} activeOpacity={0.88}>
          <View style={styles.sideCtaIcon}>
            {heroUri ? (
              <Image source={{ uri: heroUri }} style={styles.sideCtaImg} contentFit="cover" />
            ) : (
              <Text style={styles.sideCtaLetter}>{brandName[0]?.toUpperCase() ?? "A"}</Text>
            )}
          </View>
          <Text style={styles.sideCtaLabel} numberOfLines={2}>{ctaLabel(ad)}</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.bottomMeta, { paddingBottom: bottomPad + 12 }]}>
        <Text style={styles.brandName} numberOfLines={1}>{brandName}</Text>
        <Text style={styles.tagline} numberOfLines={2}>{tagline}</Text>
        <TouchableOpacity style={styles.ctaPill} onPress={handlePrimary} activeOpacity={0.88}>
          <Text style={styles.ctaPillText}>{ctaLabel(ad)}</Text>
          <Ionicons name="chevron-forward" size={14} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: SCREEN_W, position: "relative" },
  placeholder: { alignItems: "center", justifyContent: "center", backgroundColor: "#111" },
  topRow: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 4,
  },
  sponsoredPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
  },
  sponsoredText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  skipBtn: {
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
  },
  skipBtnText: { color: "#111", fontFamily: "Inter_700Bold", fontSize: 13 },
  skipWait: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 4,
  },
  skipWaitText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  sideActions: {
    position: "absolute",
    right: 10,
    alignItems: "center",
    zIndex: 4,
  },
  sideCta: { alignItems: "center", gap: 6, maxWidth: 72 },
  sideCtaIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sideCtaImg: { width: 44, height: 44 },
  sideCtaLetter: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 18 },
  sideCtaLabel: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomMeta: {
    position: "absolute",
    left: 14,
    right: 88,
    bottom: 0,
    zIndex: 4,
  },
  brandName: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4 },
  tagline: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 10 },
  ctaPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  ctaPillText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
});
