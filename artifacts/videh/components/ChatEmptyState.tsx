import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChatEncryptionNotice } from "@/components/UnsavedContactCard";

type Props = {
  displayName: string;
  initials: string;
  avatarUrl?: string;
  avatarBg: string;
  isGroup?: boolean;
  memberCount?: number;
  isDark?: boolean;
  sayHiLabel: string;
  groupHintLabel: string;
  callsDisabled?: boolean;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
};

export function ChatEmptyState({
  displayName,
  initials,
  avatarUrl,
  avatarBg,
  isGroup,
  memberCount,
  isDark,
  sayHiLabel,
  groupHintLabel,
  callsDisabled,
  onVoiceCall,
  onVideoCall,
}: Props) {
  const showCalls = !isGroup && !callsDisabled && (onVoiceCall || onVideoCall);

  return (
    <View style={styles.wrap}>
      <View style={[styles.heroCard, isDark && styles.heroCardDark]}>
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.avatarTxt}>{initials}</Text>
          )}
        </View>

        <Text style={[styles.name, isDark && styles.nameDark]} numberOfLines={2}>
          {displayName}
        </Text>

        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          {isGroup
            ? memberCount && memberCount > 0
              ? `${memberCount} members · ${groupHintLabel}`
              : groupHintLabel
            : sayHiLabel}
        </Text>

        {showCalls ? (
          <View style={styles.actionsRow}>
            {onVoiceCall ? (
              <TouchableOpacity
                style={[styles.actionBtn, isDark && styles.actionBtnDark]}
                onPress={onVoiceCall}
                activeOpacity={0.82}
                accessibilityLabel="Voice call"
              >
                <Ionicons name="call-outline" size={22} color="#059669" />
                <Text style={styles.actionLabel}>Call</Text>
              </TouchableOpacity>
            ) : null}
            {onVideoCall ? (
              <TouchableOpacity
                style={[styles.actionBtn, isDark && styles.actionBtnDark]}
                onPress={onVideoCall}
                activeOpacity={0.82}
                accessibilityLabel="Video call"
              >
                <Ionicons name="videocam-outline" size={22} color="#059669" />
                <Text style={styles.actionLabel}>Video</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      <ChatEncryptionNotice />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 4,
  },
  heroCard: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 20,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroCardDark: {
    backgroundColor: "rgba(31,44,52,0.95)",
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 16,
  },
  avatarImg: { width: 96, height: 96 },
  avatarTxt: { fontSize: 36, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  name: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: "#14131F",
    textAlign: "center",
    marginBottom: 6,
  },
  nameDark: { color: "#E9EDEF" },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#667781",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 4,
  },
  subtitleDark: { color: "#8696A0" },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  actionBtn: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 88,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(0,168,132,0.08)",
    gap: 4,
  },
  actionBtnDark: {
    backgroundColor: "rgba(0,168,132,0.16)",
  },
  actionLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#059669",
  },
});
