import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useEffect, useRef } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  recordReelsAdClick,
  recordReelsAdImpression,
  type ReelsFeedAd,
} from "@/lib/reelsApi";

type Props = { ad: ReelsFeedAd };

export function ReelsFeedAdCard({ ad }: Props) {
  const colors = useColors();
  const { user } = useApp();
  const impressedRef = useRef(false);

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

  const imageUri = ad.imageUrl ?? ad.videoUrl;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.sponsoredRow}>
        <Text style={[styles.sponsored, { color: colors.mutedForeground }]}>{ad.sponsoredLabel}</Text>
        <Text style={[styles.advertiser, { color: colors.mutedForeground }]}>{ad.advertiserName}</Text>
      </View>

      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.hero} contentFit="cover" />
      ) : (
        <View style={[styles.hero, styles.heroPlaceholder, { backgroundColor: colors.muted }]}>
          <Ionicons name="megaphone-outline" size={40} color={colors.mutedForeground} />
        </View>
      )}

      <View style={styles.body}>
        <Text style={[styles.headline, { color: colors.foreground }]} numberOfLines={2}>
          {ad.headline}
        </Text>
        {ad.description ? (
          <Text style={[styles.desc, { color: colors.mutedForeground }]} numberOfLines={2}>
            {ad.description}
          </Text>
        ) : null}

        {ad.format === "app_install" ? (
          <View style={styles.ctaCol}>
            {ad.playStoreUrl ? (
              <TouchableOpacity
                style={[styles.storeBtn, { backgroundColor: "#01875f" }]}
                onPress={() => void onTap("play_store", ad.playStoreUrl)}
              >
                <Ionicons name="logo-google-playstore" size={18} color="#fff" />
                <Text style={styles.storeBtnText}>Get it on Play Store</Text>
              </TouchableOpacity>
            ) : null}
            {ad.appStoreUrl ? (
              <TouchableOpacity
                style={[styles.storeBtn, { backgroundColor: "#000" }]}
                onPress={() => void onTap("app_store", ad.appStoreUrl)}
              >
                <Ionicons name="logo-apple" size={18} color="#fff" />
                <Text style={styles.storeBtnText}>Download on App Store</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : ad.format === "shopping" ? (
          <TouchableOpacity
            style={[styles.primaryCta, { backgroundColor: colors.primary }]}
            onPress={() => void onTap("cta", ad.destinationUrl)}
          >
            <Ionicons name="bag-handle-outline" size={18} color="#fff" />
            <Text style={styles.primaryCtaText}>Shop Now</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.primaryCta, { backgroundColor: colors.primary }]}
            onPress={() => void onTap("destination", ad.destinationUrl)}
          >
            <Text style={styles.primaryCtaText}>
              {ad.ctaType === "watch_now" ? "Watch now" : "Learn more"}
            </Text>
            <Ionicons name="open-outline" size={16} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  sponsoredRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  sponsored: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  advertiser: { fontSize: 11, fontFamily: "Inter_400Regular" },
  hero: { width: "100%", height: 200 },
  heroPlaceholder: { alignItems: "center", justifyContent: "center" },
  body: { padding: 12, gap: 8 },
  headline: { fontSize: 16, fontFamily: "Inter_700Bold" },
  desc: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  ctaCol: { gap: 8, marginTop: 4 },
  storeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  storeBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  primaryCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 4,
  },
  primaryCtaText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
