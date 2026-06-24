import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import React from "react";
import {
  Alert,
  Platform,
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
  bottomInset?: number;
  onLearnMore: () => void;
  onInstall: () => void;
  onAdsPortalPress?: () => void;
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

function adTypeLabel(ad: ReelsAdBreakItem): string {
  if (ad.adType === "skippable") return "Skippable ad";
  return "Non-skippable ad";
}

function ctaLabel(ad: ReelsAdBreakItem): string {
  const isAppInstall = ad.format === "app_install" || Boolean(ad.playStoreUrl || ad.appStoreUrl);
  if (isAppInstall || ad.ctaType === "install") return "Install";
  if (ad.ctaType === "shop_now") return "Shop now";
  return "Watch now";
}

export function ReelsAdDetailPanel({
  ad,
  colors,
  bottomInset = 0,
  onLearnMore,
  onInstall,
  onAdsPortalPress,
}: Props) {
  const isAppInstall = ad.format === "app_install" || Boolean(ad.playStoreUrl || ad.appStoreUrl);
  const promoImages = [ad.promoImageUrl, ad.promoImageUrl2].filter(Boolean) as string[];
  const showStats = isAppInstall && (
    ad.appRating != null || ad.appReviewCount || ad.appDownloadCount || ad.appCategory
  );
  const durationLabel = ad.durationSeconds > 0 ? `${Math.round(ad.durationSeconds)}s` : null;
  const primaryCta = ctaLabel(ad);

  const onAdsPortalLink = () => {
    if (onAdsPortalPress) onAdsPortalPress();
    else void Linking.openURL("https://ads.videh.co.in/").catch(() => {});
  };

  return (
    <View style={[styles.panel, { backgroundColor: colors.background }]}>
      <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sponsoredTitle, { color: colors.foreground }]}>
          {ad.sponsoredLabel ?? "Sponsored"}
        </Text>
        <TouchableOpacity
          onPress={() => Alert.alert("Coming soon", "More ad options will be available in a future update.")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        bounces
        nestedScrollEnabled={Platform.OS === "android"}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.metaRow}>
          <View style={[styles.metaChip, { backgroundColor: colors.muted }]}>
            <Text style={[styles.metaChipText, { color: colors.foreground }]}>{adTypeLabel(ad)}</Text>
          </View>
          {durationLabel ? (
            <View style={[styles.metaChip, { backgroundColor: colors.muted }]}>
              <Text style={[styles.metaChipText, { color: colors.foreground }]}>{durationLabel}</Text>
            </View>
          ) : null}
        </View>

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
            <TouchableOpacity onPress={onAdsPortalLink} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Text style={[styles.adsPortalLink, { color: colors.mutedForeground }]}>
                Served via Videh Ads · ads.videh.co.in
              </Text>
            </TouchableOpacity>
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
          <Text style={[styles.description, { color: colors.foreground }]}>
            {ad.description}
          </Text>
        ) : (
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Tap Learn more to visit the advertiser, or skip when available to continue watching.
          </Text>
        )}

        {promoImages.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promoRow}>
            {promoImages.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.promoCard} contentFit="cover" />
            ))}
          </ScrollView>
        ) : null}
      </ScrollView>

      <View style={[styles.actionsRow, { borderTopColor: colors.border, paddingBottom: Math.max(12, bottomInset) }]}>
        <TouchableOpacity style={[styles.learnBtn, { backgroundColor: colors.muted }]} onPress={onLearnMore}>
          <Text style={[styles.learnBtnText, { color: colors.foreground }]}>Learn more</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.installBtn} onPress={onInstall}>
          <Text style={styles.installBtnText}>{primaryCta}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: "hidden", minHeight: 0 },
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
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 12, flexGrow: 1 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 12, paddingBottom: 4 },
  metaChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  metaChipText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  identityRow: { flexDirection: "row", gap: 12, paddingTop: 10, paddingBottom: 10 },
  appIcon: { width: 52, height: 52, borderRadius: 12 },
  identityText: { flex: 1, minWidth: 0 },
  appTitle: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 20 },
  appSubtitle: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 2 },
  adsPortalLink: { fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 6, textDecorationLine: "underline" },
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
    paddingTop: 12,
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
