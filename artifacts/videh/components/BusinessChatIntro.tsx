import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

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
      "This business sends messages through Videh's secure Business API. Your personal messages with people you know stay end-to-end encrypted.",
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
  onManageMessages: () => void;
};

export function BusinessIntroCard({
  displayName,
  logoUrl,
  joinedLabel,
  isDark,
  onManageMessages,
}: CardProps) {
  const initials = displayName.split(/\s+/).map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "B";

  return (
    <View style={styles.cardWrap}>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <View style={styles.logoWrap}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoImg} contentFit="cover" />
          ) : (
            <View style={styles.logoFallback}>
              <Text style={styles.logoFallbackTxt}>{initials}</Text>
            </View>
          )}
        </View>

        <View style={styles.nameRow}>
          <Text style={[styles.businessName, isDark && styles.businessNameDark]} numberOfLines={2}>
            {displayName}
          </Text>
          <Ionicons name="checkmark-circle" size={18} color="#1DAA61" style={styles.verifiedIcon} />
        </View>

        <Text style={styles.accountLine}>Business account • {joinedLabel}</Text>

        <TouchableOpacity style={styles.manageBtn} onPress={onManageMessages} activeOpacity={0.8}>
          <Text style={styles.manageBtnTxt}>Manage messages</Text>
        </TouchableOpacity>
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
  bannerBrand: { fontFamily: "Inter_700Bold", color: "#111B21" },
  bannerLink: { color: "#00A884", fontFamily: "Inter_500Medium" },
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
  cardDark: { backgroundColor: "#1F2C34" },
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
  logoFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#00A88422",
    alignItems: "center",
    justifyContent: "center",
  },
  logoFallbackTxt: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#00A884" },
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
    color: "#111B21",
    textAlign: "center",
    flexShrink: 1,
  },
  businessNameDark: { color: "#E9EDEF" },
  verifiedIcon: { marginTop: 2 },
  accountLine: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#667781",
    textAlign: "center",
    marginBottom: 18,
  },
  manageBtn: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 11,
    minWidth: 200,
    alignItems: "center",
  },
  manageBtnTxt: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#00A884",
  },
});
