import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  isVideo: boolean;
  durationLabel: string;
  onReturn: () => void;
};

/** WhatsApp-style strip inside an open chat while a call is active. */
export function ReturnToCallChatBar({ isVideo, durationLabel, onReturn }: Props) {
  return (
    <TouchableOpacity style={styles.wrap} onPress={onReturn} activeOpacity={0.92}>
      <Ionicons name={isVideo ? "videocam" : "call"} size={18} color="#fff" />
      <Text style={styles.text} numberOfLines={1}>
        {isVideo ? "Return to video call" : "Return to voice call"} · {durationLabel}
      </Text>
      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.9)" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#00A884",
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 8,
    marginBottom: 4,
    borderRadius: 10,
  },
  text: {
    flex: 1,
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
