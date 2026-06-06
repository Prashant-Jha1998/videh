import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";

type Props = {
  size?: number;
};

/** WhatsApp-style timer overlay on chat avatar when disappearing messages are on. */
export function DisappearTimerBadge({ size = 16 }: Props) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="timer-outline" size={Math.round(size * 0.68)} color="#54656F" />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    right: -1,
    bottom: -1,
    backgroundColor: "#F0F2F5",
    borderWidth: 1.5,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
