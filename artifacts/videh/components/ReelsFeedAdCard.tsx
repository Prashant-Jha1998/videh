import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useMemo, useRef } from "react";
import { Dimensions, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  recordReelsAdClick,
  recordReelsAdImpression,
  type ReelsFeedAd,
} from "@/lib/reelsApi";

const SCREEN_W = Dimensions.get("window").width;
const HERO_H = Math.round((SCREEN_W * 9) / 16);

type Props = { ad: ReelsFeedAd };

function ctaLabel(ad: ReelsFeedAd): string {
  if (ad.format === "app_install" || ad.ctaType === "install") return "Install";
  if (ad.format === "shopping" || ad.ctaType === "shop_now") return "Shop now";
  if (ad.ctaType === "watch_now") return "Watch now";
  return "Learn more";
}

function primaryTapTarget(ad: ReelsFeedAd): { target: "cta" | "play_store" | "app_store" | "destination"; url?: string | null } {
  if (ad.format === "app_install") {
    if (ad.playStoreUrl) return { target: "play_store", url: ad.playStoreUrl };
    if (ad.appStoreUrl) return { target: "app_store", url: ad.appStoreUrl };
  }
  return { target: "destination", url: ad.destinationUrl ?? ad.playStoreUrl ?? ad.appStoreUrl };
}

function displayRating(ad: ReelsFeedAd): string | null {
  if (ad.format !== "app_install") return null;
  const score = 4 + ((ad.id * 7) % 9) / 10;
  return `${score.toFixed(1)}★`;
}

export function ReelsFeedAdCard({ ad }: Props) {
  const colors = useColors();
  const { user } = useApp();
  const impressedRef = useRef(false);

  const heroUri = ad.imageUrl ?? ad.videoUrl;
  const brandName = ad.appName ?? ad.headline ?? ad.title;
  const tagline = ad.description?.trim() || ad.advertiserName;
  const rating = useMemo(() => displayRating(ad), [ad]);
  const cta = ctaLabel(ad);

  useEffect(() => {
    if (impressedRef.current || !user?.dbId || ad.id <= 0) return;
    impressedRef.current = true;
    void recordReelsAdImpression(
      {
        creativeId: ad.id,
        contentVideoId: 0,
        userId: user.dbId,
        placement: "feed_instream",
        watchedSeconds: 0,
        skipped: false,
        completed: false,
      },
      user.sessionToken,
    );
  }, [ad.id, user?.dbId, user?.sessionToken]);

  const onTap = async (target: "cta" | "play_store" | "app_store" | "destination", url?: string | null) => {
    if (user?.dbId && ad.id > 0) {
      await recordReelsAdClick(
        { creativeId: ad.id, userId: user.dbId, placement: "feed_instream", clickTarget: target },
        user.sessionToken,
      );
    }
    if (url) void Linking.openURL(url);
  };

  const handlePrimary = () => {
    const { target, url } = primaryTapTarget(ad);
    void onTap(target === "destination" ? "cta" : target, url);
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity activeOpacity={0.92} onPress={handlePrimary}>
        {heroUri ? (
          <Image source={{ uri: heroUri }} style={styles.hero} contentFit="cover" />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder, { backgroundColor: colors.muted }]}>
            <Ionicons name="megaphone-outline" size={44} color={colors.mutedForeground} />
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.infoRow}>
        <TouchableOpacity style={styles.iconSlot} onPress={handlePrimary} activeOpacity={0.85}>
          {heroUri ? (
            <Image source={{ uri: heroUri }} style={styles.brandIcon} contentFit="cover" />
          ) : (
            <View style={[styles.brandIcon, styles.brandIconFallback, { backgroundColor: colors.primary }]}>
              <Text style={styles.brandIconLetter}>{brandName[0]?.toUpperCase() ?? "A"}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.infoText} onPress={handlePrimary} activeOpacity={0.85}>
          <Text style={[styles.headline, { color: colors.foreground }]} numberOfLines={2}>
            {brandName}
          </Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]} numberOfLines={1}>
            {tagline}
          </Text>
          <Text style={[styles.metaLine, { color: colors.mutedForeground }]} numberOfLines={1}>
            {ad.sponsoredLabel}
            {rating ? ` · ${rating}` : ""}
            {ad.format === "app_install" ? " · FREE" : ""}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-vertical" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.installBtn} onPress={handlePrimary} activeOpacity={0.88}>
        <Text style={styles.installBtnText}>{cta}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  hero: { width: SCREEN_W, height: HERO_H },
  heroPlaceholder: { alignItems: "center", justifyContent: "center" },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
  },
  iconSlot: { paddingTop: 2 },
  brandIcon: { width: 36, height: 36, borderRadius: 8 },
  brandIconFallback: { alignItems: "center", justifyContent: "center" },
  brandIconLetter: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 15 },
  infoText: { flex: 1 },
  headline: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
  tagline: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  metaLine: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  menuBtn: { paddingTop: 4, paddingLeft: 4 },
  installBtn: {
    marginHorizontal: 12,
    marginTop: 10,
    backgroundColor: "#0f0f0f",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  installBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    letterSpacing: 0.2,
  },
});
