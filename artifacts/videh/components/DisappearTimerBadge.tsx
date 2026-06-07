import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";

type Props = {
  size?: number;
  /** header = chat top bar on green; list = chats tab row */
  variant?: "list" | "header" | "profile";
};

/** WhatsApp-style timer overlay on chat avatar when disappearing messages are on. */
export function DisappearTimerBadge({ size = 16, variant = "list" }: Props) {
  const isHeader = variant === "header";
  const iconSize = Math.round(size * (isHeader ? 0.58 : 0.68));
  const iconColor = isHeader ? "#075E54" : "#54656F";
  const backgroundColor = isHeader ? "#FFFFFF" : "#F0F2F5";

  return (
    <View
      style={[
        styles.badge,
        isHeader ? styles.badgeHeader : styles.badgeList,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
      ]}
    >
      <Ionicons name="timer-outline" size={iconSize} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeList: {
    right: -1,
    bottom: -1,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  badgeHeader: {
    right: -2,
    bottom: -2,
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1.5,
    elevation: 2,
  },
});
