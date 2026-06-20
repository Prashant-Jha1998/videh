import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import {
  disappearSystemMessageCopy,
  parseChatSystemPayload,
  promotedAdminMessageCopy,
} from "@/lib/chatSystemMessage";

type Props = {
  text: string;
  isDark?: boolean;
  viewerUserId?: number;
  onChangeTimer?: () => void;
};

/** WhatsApp-style centered info card when disappearing messages timer changes. */
export function ChatSystemMessageBubble({ text, isDark, viewerUserId, onChangeTimer }: Props) {
  const payload = parseChatSystemPayload(text);
  if (!payload) return null;

  const bg = isDark ? "rgba(38,52,59,0.96)" : "#FFFFFF";
  const fg = isDark ? "rgba(255,255,255,0.9)" : "#54656F";
  const link = isDark ? "#53BDEB" : "#027EB5";

  if (payload.kind === "promoted_admin") {
    const copy = promotedAdminMessageCopy(payload, viewerUserId);
    return (
      <View style={styles.wrap}>
        <View style={[styles.card, { backgroundColor: bg }]}>
          <Text style={[styles.body, { color: fg }]}>{copy}</Text>
        </View>
      </View>
    );
  }

  const copy = disappearSystemMessageCopy(payload.seconds);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: bg }, !isDark && styles.cardLight]}>
        <Ionicons name="timer-outline" size={18} color={fg} style={styles.icon} />
        <View style={styles.textCol}>
          <Text style={[styles.body, { color: fg }]}>
            {copy.body}
            {copy.showChangeLink && onChangeTimer ? " " : null}
            {copy.showChangeLink && onChangeTimer ? (
              <Text style={[styles.link, { color: link }]} onPress={onChangeTimer}>
                Change timer
              </Text>
            ) : null}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Inline banner (same copy) for chats with timer on but no system row yet. */
export function DisappearingMessagesInfoBanner({
  seconds,
  isDark,
  onChangeTimer,
}: {
  seconds: number;
  isDark?: boolean;
  onChangeTimer?: () => void;
}) {
  const text = JSON.stringify({ kind: "disappear_timer", seconds });
  return (
    <ChatSystemMessageBubble
      text={text}
      isDark={isDark}
      onChangeTimer={onChangeTimer}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 6,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    maxWidth: 340,
    width: "100%",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardLight: Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 2 },
    default: {},
  }),
  icon: { marginTop: 1 },
  textCol: { flex: 1 },
  body: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    textAlign: "left",
  },
  link: {
    fontFamily: "Inter_600SemiBold",
  },
});
