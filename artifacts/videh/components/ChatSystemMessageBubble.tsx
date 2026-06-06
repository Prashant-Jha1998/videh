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

export function ChatSystemMessageBubble({ text, isDark, viewerUserId, onChangeTimer }: Props) {
  const payload = parseChatSystemPayload(text);
  if (!payload) return null;

  const bg = isDark ? "rgba(38,52,59,0.92)" : "rgba(255,255,255,0.96)";
  const fg = isDark ? "rgba(255,255,255,0.88)" : "#54656F";
  const link = isDark ? "#53BDEB" : "#027EB5";

  if (payload.kind === "promoted_admin") {
    const copy = promotedAdminMessageCopy(payload, viewerUserId);
    return (
      <View style={styles.wrap}>
        <View style={[styles.pill, { backgroundColor: bg }]}>
          <Text style={[styles.pillText, { color: fg }]}>{copy}</Text>
        </View>
      </View>
    );
  }

  const copy = disappearSystemMessageCopy(payload.seconds);
  return (
    <View style={styles.wrap}>
      <View style={[styles.card, { backgroundColor: bg }]}>
        <Ionicons name="timer-outline" size={16} color={fg} style={styles.icon} />
        <Text style={[styles.body, { color: fg }]}>
          {copy.body}
          {copy.showChangeLink && onChangeTimer ? (
            <>
              {" "}
              <Text style={[styles.link, { color: link }]} onPress={onChangeTimer}>
                Change timer
              </Text>
            </>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingHorizontal: 28,
    paddingVertical: 8,
  },
  pill: {
    maxWidth: 340,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  pillText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    maxWidth: 340,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  icon: { marginTop: 2 },
  body: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    textAlign: "center",
  },
  link: {
    fontFamily: "Inter_600SemiBold",
  },
});
