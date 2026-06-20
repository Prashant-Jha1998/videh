import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { ReelsAdBreakItem } from "@/lib/reelsApi";

type Props = {
  ad: ReelsAdBreakItem;
  colors: {
    background: string;
    foreground: string;
    mutedForeground: string;
    border: string;
    muted: string;
  };
  onLearnMore: () => void;
  onInstall: () => void;
  onHide?: () => void;
};

function displayTitle(ad: ReelsAdBreakItem): string {
  if (ad.format === "app_install" && ad.appName) return ad.appName;
  return ad.headline ?? ad.title;
}

function displaySubtitle(ad: ReelsAdBreakItem): string {
  if (ad.format === "app_install") {
    return ad.appDeveloper ?? ad.advertiserName;
  }
  return ad.advertiserName;
}

export function ReelsAdDetailPanel({ ad, colors, onLearnMore, onInstall, onHide }: Props) {
  const isAppInstall = ad.format === "app_install" || Boolean(ad.playStoreUrl || ad.appStoreUrl);
  const promoImages = [ad.promoImageUrl, ad.promoImageUrl2].filter(Boolean) as string[];
  const showStats = isAppInstall && (
    ad.appRating != null || ad.appReviewCount || ad.appDownloadCount || ad.appCategory
  );

  return (
    <View style={[styles.panel, { backgroundColor: colors.background }]}>
      <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sponsoredTitle, { color: colors.foreground }]}>
          {ad.sponsoredLabel ?? "Sponsored"}
        </Text>
        <View style={styles.panelHeaderActions}>
          {onHide ? (
            <TouchableOpacity onPress={onHide} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="ellipsis-vertical" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView style={styles.scroll} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.identityRow}>
          {ad.imageUrl ? (
            <Image source={{ uri: ad.imageUrl }} style={styles.appIcon} contentFit="cover" />
          ) : (
            <View style={[styles.appIcon, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="apps-outline" size={24} color={colors.mutedForeground} />
            </View>
          )}
          <View style={styles.identityText}>
            <Text style={[styles.appTitle, { color: colors.foreground }]} numberOfLines={2}>
              {displayTitle(ad)}
            </Text>
            <Text style={[styles.appSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
              {displaySubtitle(ad)}
            </Text>
            {isAppInstall ? (
              <View style={styles.storeRow}>
                <Ionicons name="logo-google-playstore" size={14} color={colors.mutedForeground} />
                <Text style={[styles.storeText, { color: colors.mutedForeground }]}>
                  Google Play · {ad.appPriceLabel ?? "FREE"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {showStats ? (
          <View style={[styles.statsRow, { borderColor: colors.border }]}>
            {ad.appRating != null ? (
              <View style={styles.statCol}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>
                  {ad.appRating.toFixed(1)} ★
                </Text>
                {ad.appReviewCount ? (
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                    {ad.appReviewCount}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {ad.appDownloadCount ? (
              <View style={styles.statCol}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{ad.appDownloadCount}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Downloads</Text>
              </View>
            ) : null}
            {ad.appCategory ? (
              <View style={styles.statCol}>
                <Text style={[styles.statValue, { color: colors.foreground }]} numberOfLines={1}>
                  {ad.appCategory}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Category</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {ad.description ? (
          <Text style={[styles.description, { color: colors.foreground }]} numberOfLines={4}>
            {ad.description}
          </Text>
        ) : null}

        {promoImages.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promoRow}>
            {promoImages.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.promoCard} contentFit="cover" />
            ))}
          </ScrollView>
        ) : null}
      </ScrollView>

      <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.learnBtn, { backgroundColor: colors.muted }]} onPress={onLearnMore}>
          <Text style={[styles.learnBtnText, { color: colors.foreground }]}>Learn more</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.installBtn} onPress={onInstall}>
          <Text style={styles.installBtnText}>
            {isAppInstall || ad.ctaType === "install" ? "Install" : ad.ctaType === "shop_now" ? "Shop now" : "Watch now"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden" },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sponsoredTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  panelHeaderActions: { flexDirection: "row", alignItems: "center" },
  scroll: { flex: 1, paddingHorizontal: 16 },
  identityRow: { flexDirection: "row", gap: 12, paddingTop: 14, paddingBottom: 10 },
  appIcon: { width: 52, height: 52, borderRadius: 12 },
  identityText: { flex: 1, minWidth: 0 },
  appTitle: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 20 },
  appSubtitle: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  storeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  statCol: { flex: 1, alignItems: "flex-start" },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 15 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  promoRow: { gap: 10, paddingBottom: 12 },
  promoCard: { width: 132, height: 234, borderRadius: 10, backgroundColor: "#eee" },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  learnBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 24,
  },
  learnBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  installBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: "#111",
  },
  installBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
