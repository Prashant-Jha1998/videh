import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BusinessLogoAvatar, BusinessVerifiedBadge } from "@/components/BusinessVerifiedBadge";

type BannerProps = {
  onLearnMore?: () => void;
};

export function BusinessSecureBanner({ onLearnMore }: BannerProps) {
  const openLearnMore = () => {
    if (onLearnMore) {
      onLearnMore();
      return;
    }
    Alert.alert(
      "Videh Business",
      "This business sends messages through Videh's secure Business API. Your personal chats use the same Videh transport security as direct messages.",
    );
  };

  return (
    <View style={styles.bannerWrap}>
      <TouchableOpacity style={styles.bannerPill} onPress={openLearnMore} activeOpacity={0.85}>
        <Text style={styles.bannerText}>
          This business uses a secure service from{" "}
          <Text style={styles.bannerBrand}>Videh</Text>
          {" "}to manage this chat.{" "}
          <Text style={styles.bannerLink}>Tap to learn more.</Text>
        </Text>
      </TouchableOpacity>
    </View>
  );
}

type CardProps = {
  displayName: string;
  logoUrl?: string;
  joinedLabel: string;
  isDark?: boolean;
  onStop: () => void;
  onProfile: () => void;
};

export function BusinessIntroCard({
  displayName,
  logoUrl,
  joinedLabel,
  isDark,
  onStop,
  onProfile,
}: CardProps) {
  return (
    <View style={styles.cardWrap}>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <View style={styles.logoWrap}>
          <BusinessLogoAvatar uri={logoUrl} displayName={displayName} size={88} />
        </View>

        <View style={styles.nameRow}>
          <Text style={[styles.businessName, isDark && styles.businessNameDark]} numberOfLines={2}>
            {displayName}
          </Text>
          <BusinessVerifiedBadge size={20} />
        </View>

        <Text style={styles.accountLine}>Business account • {joinedLabel}</Text>

        <Text style={styles.offersLine}>
          You are getting offers and announcements from this business.
        </Text>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={onStop} activeOpacity={0.8}>
            <Ionicons name="hand-left-outline" size={18} color="#14131F" />
            <Text style={styles.actionBtnTxt}>Stop</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onProfile} activeOpacity={0.8}>
            <Text style={styles.actionBtnTxt}>Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/** Formats API activation date from server (channel verified / API approved). */
export function formatBusinessJoinedLabel(joinedAt?: string | null): string {
  if (!joinedAt) return "Joined recently";
  const d = new Date(joinedAt);
  if (Number.isNaN(d.getTime())) return "Joined recently";
  const month = d.toLocaleDateString("en-IN", { month: "long" });
  const year = d.getFullYear();
  return `Joined in ${month}, ${year}`;
}

/** Footer info when business marketing is active (standard). */
export function BusinessOffersInfoBanner({ onLearnMore }: { onLearnMore?: () => void }) {
  return (
    <View style={styles.offersBannerWrap}>
      <Text style={styles.offersBannerText}>
        <Ionicons name="information-circle-outline" size={14} color="#667781" />{" "}
        This chat has offers and announcements.{" "}
        <Text style={styles.bannerLink} onPress={onLearnMore}>
          Learn more
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  bannerPill: {
    backgroundColor: "#E7F8EE",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#3B4A54",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  bannerBrand: { fontFamily: "Inter_700Bold", color: "#14131F" },
  bannerLink: { color: "#059669", fontFamily: "Inter_500Medium" },
  cardWrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardDark: { backgroundColor: "#1E1D2E" },
  logoWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: "hidden",
    marginBottom: 14,
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: { width: 88, height: 88 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 6,
    maxWidth: "100%",
  },
  businessName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#14131F",
    textAlign: "center",
    flexShrink: 1,
  },
  businessNameDark: { color: "#E9EDEF" },
  accountLine: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#667781",
    textAlign: "center",
    marginBottom: 10,
  },
  offersLine: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#667781",
    textAlign: "center",
    marginBottom: 18,
    paddingHorizontal: 8,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 24,
    paddingVertical: 11,
  },
  actionBtnTxt: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#14131F",
  },
  offersBannerWrap: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: "center",
  },
  offersBannerText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: "#667781",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});
