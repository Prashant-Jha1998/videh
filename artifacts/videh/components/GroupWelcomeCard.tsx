import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { formatDisplayPhone } from "@/lib/videhContacts";

type Props = {
  addedByPhone: string;
  addedByName?: string;
  creatorIsContact: boolean;
  memberCount: number;
  contactsInGroupCount: number;
  createdLabel: string;
  isDark?: boolean;
  onExitGroup: () => void;
  onStay: () => void;
  onReport: () => void;
};

function membersContactsLine(memberCount: number, contactsInGroupCount: number): string {
  const members = `${memberCount} member${memberCount === 1 ? "" : "s"}`;
  if (contactsInGroupCount <= 0) return `${members}, no contacts`;
  const contacts = `${contactsInGroupCount} contact${contactsInGroupCount === 1 ? "" : "s"}`;
  return `${members}, ${contacts}`;
}

export function GroupWelcomeCard({
  addedByPhone,
  addedByName,
  creatorIsContact,
  memberCount,
  contactsInGroupCount,
  createdLabel,
  isDark,
  onExitGroup,
  onStay,
  onReport,
}: Props) {
  const displayPhone = formatDisplayPhone(addedByPhone);
  const addedByLine = creatorIsContact && addedByName?.trim()
    ? `Added by ${addedByName.trim()}`
    : `Added by ${displayPhone}${creatorIsContact ? "" : " · Not a contact"}`;

  const openSafetyTools = () => {
    Alert.alert("Safety tools", "Choose an action for this group.", [
      { text: "Cancel", style: "cancel" },
      { text: "Report group", onPress: onReport },
      { text: "Exit group", style: "destructive", onPress: onExitGroup },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <View style={styles.groupIcon}>
          <Ionicons name="people" size={36} color="#FFFFFF" />
        </View>

        <Text style={[styles.heading, isDark && styles.headingDark]}>{addedByLine}</Text>

        <Text style={styles.subline}>
          {membersContactsLine(memberCount, contactsInGroupCount)} · Group created {createdLabel} by {displayPhone}
        </Text>

        <TouchableOpacity style={styles.safetyRow} onPress={openSafetyTools} activeOpacity={0.7}>
          <Ionicons name="shield-checkmark" size={16} color="#5B4FE8" />
          <Text style={styles.safetyText}>Safety tools</Text>
        </TouchableOpacity>

        <View style={[styles.actionsRow, isDark && styles.actionsRowDark]}>
          <TouchableOpacity style={styles.actionBtn} onPress={onExitGroup} activeOpacity={0.7}>
            <Ionicons name="exit-outline" size={18} color="#EA0038" />
            <Text style={styles.exitTxt}>Exit group</Text>
          </TouchableOpacity>
          <View style={[styles.actionDivider, isDark && styles.actionDividerDark]} />
          <TouchableOpacity style={styles.actionBtn} onPress={onStay} activeOpacity={0.7}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#5B4FE8" />
            <Text style={styles.stayTxt}>Stay</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  cardDark: { backgroundColor: "#1E1D2E" },
  groupIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#8E7CC3",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heading: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#14131F",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 24,
  },
  headingDark: { color: "#E9EDEF" },
  subline: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#667781",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 14,
  },
  safetyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 18,
  },
  safetyText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#5B4FE8" },
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
  exitTxt: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#EA0038" },
  stayTxt: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#5B4FE8" },
});
