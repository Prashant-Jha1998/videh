import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type CallOutcome = "no_answer" | "declined" | "busy";

type Props = {
  contactName: string;
  avatarUrl?: string | null;
  outcome: CallOutcome;
  onCancel: () => void;
  onCallAgain: () => void;
  onVoiceMessage: () => void;
};

function outcomeLabel(outcome: CallOutcome): string {
  if (outcome === "declined") return "Declined";
  if (outcome === "busy") return "On another call";
  return "No answer";
}

export function CallOutcomeScreen({
  contactName,
  avatarUrl,
  outcome,
  onCancel,
  onCallAgain,
  onVoiceMessage,
}: Props) {
  const insets = useSafeAreaInsets();
  const initials = contactName
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
  const hue = (contactName.charCodeAt(0) || 32) * 37 % 360;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: Math.max(insets.bottom, 16) + 20 }]}>
      <View style={styles.top}>
        <Text style={styles.name}>{contactName}</Text>
        <Text style={styles.status}>{outcomeLabel(outcome)}</Text>
      </View>

      <View style={styles.center}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: `hsl(${hue},48%,42%)` }]}>
            <Text style={styles.avatarTxt}>{initials}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.actionCol}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onCancel();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={28} color="#111" />
          </TouchableOpacity>
          <Text style={styles.actionLbl}>Cancel</Text>
        </View>

        <View style={styles.actionCol}>
          <TouchableOpacity
            style={styles.messageBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onVoiceMessage();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="mic" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.actionLbl}>Record voice message</Text>
        </View>

        <View style={styles.actionCol}>
          <TouchableOpacity
            style={styles.callAgainBtn}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              onCallAgain();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="call" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.actionLblGreen}>Call again</Text>
        </View>
      </View>
    </View>
  );
}

const AVATAR = 168;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B141A",
    alignItems: "center",
  },
  top: {
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  name: {
    color: "#F0F2F5",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  status: {
    color: "#8696A0",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    textAlign: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  avatarImg: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: {
    color: "#fff",
    fontSize: 52,
    fontFamily: "Inter_700Bold",
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 28,
    maxWidth: 400,
  },
  actionCol: {
    flex: 1,
    alignItems: "center",
    gap: 10,
    minHeight: 100,
    justifyContent: "flex-start",
  },
  cancelBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  messageBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  callAgainBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#00A884",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLbl: {
    color: "#E9EDEF",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    maxWidth: 96,
  },
  actionLblGreen: {
    color: "#00A884",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
});
