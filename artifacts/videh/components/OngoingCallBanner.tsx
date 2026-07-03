import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  contactName: string;
  isVideo: boolean;
  durationLabel: string;
  onReturn: () => void;
  onEnd: () => void;
};

export function OngoingCallBanner({ contactName, isVideo, durationLabel, onReturn, onEnd }: Props) {
  const insets = useSafeAreaInsets();
  const top = insets.top + (Platform.OS === "ios" ? 4 : 8);

  return (
    <View style={[styles.wrap, { top }]}>
      <TouchableOpacity style={styles.main} onPress={onReturn} activeOpacity={0.92}>
        <View style={styles.iconWrap}>
          <Ionicons name={isVideo ? "videocam" : "call"} size={20} color="#fff" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {isVideo ? "Video call" : "Voice call"} · {durationLabel}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>Tap to return to {contactName}</Text>
        </View>
        <Ionicons name="chevron-up" size={22} color="#E0DCFF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.endBtn} onPress={onEnd} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="call" size={20} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    zIndex: 200,
    elevation: 20,
  },
  main: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#059669",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1 },
  title: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  endBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
});
