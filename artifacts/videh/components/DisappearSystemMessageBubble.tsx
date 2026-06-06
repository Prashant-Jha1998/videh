import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import {
  disappearSystemMessageCopy,
  parseDisappearSystemPayload,
} from "@/lib/disappearSystemMessage";

type Props = {
  text: string;
  isDark?: boolean;
  onChangeTimer?: () => void;
};

export function DisappearSystemMessageBubble({ text, isDark, onChangeTimer }: Props) {
  const payload = parseDisappearSystemPayload(text);
  if (!payload) return null;
  const copy = disappearSystemMessageCopy(payload.seconds);
  const bg = isDark ? "rgba(38,52,59,0.92)" : "rgba(255,255,255,0.96)";
  const fg = isDark ? "rgba(255,255,255,0.88)" : "#54656F";
  const link = isDark ? "#53BDEB" : "#027EB5";

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
