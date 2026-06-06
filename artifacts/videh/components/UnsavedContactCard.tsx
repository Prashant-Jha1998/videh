import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { formatDisplayPhone } from "@/lib/videhContacts";

type Props = {
  phone: string;
  profileName: string;
  initials: string;
  avatarUrl?: string;
  avatarBg: string;
  commonGroupCount: number;
  isDark?: boolean;
  onBlock: () => void;
  onAdd: () => void;
  onReport: () => void;
};

function commonGroupsLabel(count: number): string {
  if (count <= 0) return "No common groups";
  if (count === 1) return "1 common group";
  return `${count} common groups`;
}

export function ChatEncryptionNotice() {
  return (
    <View style={styles.encryptWrap}>
      <View style={styles.encryptPill}>
        <Ionicons name="lock-closed" size={14} color="#C9A227" />
        <Text style={styles.encryptText}>
          Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them.{" "}
          <Text style={styles.encryptLink}>Learn more</Text>
        </Text>
      </View>
    </View>
  );
}

export function UnsavedContactCard({
  phone,
  profileName,
  initials,
  avatarUrl,
  avatarBg,
  commonGroupCount,
  isDark,
  onBlock,
  onAdd,
  onReport,
}: Props) {
  const displayPhone = formatDisplayPhone(phone);
  const showProfileName =
    profileName.trim().length > 0 &&
    profileName.replace(/\D/g, "") !== phone.replace(/\D/g, "");

  const openSafetyTools = () => {
    Alert.alert("Safety tools", "Choose an action for this contact.", [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: onBlock },
      { text: "Report", onPress: onReport },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.avatarTxt}>{initials}</Text>
          )}
        </View>

        <Text style={[styles.phone, isDark && styles.phoneDark]}>{displayPhone}</Text>

        {showProfileName ? (
          <Text style={styles.profileName}>~ {profileName}</Text>
        ) : null}

        <Text style={styles.statusLine}>
          Not a contact • {commonGroupsLabel(commonGroupCount)}
        </Text>

        <TouchableOpacity style={styles.safetyRow} onPress={openSafetyTools} activeOpacity={0.7}>
          <Ionicons name="shield-checkmark" size={16} color="#00A884" />
          <Text style={styles.safetyText}>Safety tools</Text>
        </TouchableOpacity>

        <View style={[styles.actionsRow, isDark && styles.actionsRowDark]}>
          <TouchableOpacity style={styles.actionBtn} onPress={onBlock} activeOpacity={0.7}>
            <Ionicons name="ban-outline" size={18} color="#EA0038" />
            <Text style={styles.blockTxt}>Block</Text>
          </TouchableOpacity>
          <View style={[styles.actionDivider, isDark && styles.actionDividerDark]} />
          <TouchableOpacity style={styles.actionBtn} onPress={onAdd} activeOpacity={0.7}>
            <Ionicons name="person-add-outline" size={18} color="#00A884" />
            <Text style={styles.addTxt}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  encryptWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  encryptPill: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFF9C4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  encryptText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: "#54656F", fontFamily: "Inter_400Regular" },
  encryptLink: { color: "#00A884", fontFamily: "Inter_500Medium" },
  wrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 0,
    paddingHorizontal: 20,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardDark: { backgroundColor: "#1F2C34" },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 14,
  },
  avatarImg: { width: 84, height: 84 },
  avatarTxt: { fontSize: 34, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  phone: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#111B21",
    textAlign: "center",
    marginBottom: 4,
  },
  phoneDark: { color: "#E9EDEF" },
  profileName: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#667781",
    textAlign: "center",
    marginBottom: 4,
  },
  statusLine: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#667781",
    textAlign: "center",
    marginBottom: 14,
  },
  safetyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 18,
  },
  safetyText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#00A884" },
  actionsRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  actionsRowDark: { borderTopColor: "rgba(255,255,255,0.08)" },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  actionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  actionDividerDark: { backgroundColor: "rgba(255,255,255,0.08)" },
  blockTxt: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#EA0038" },
  addTxt: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#00A884" },
});
