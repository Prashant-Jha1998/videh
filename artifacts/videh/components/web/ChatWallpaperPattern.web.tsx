import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useColors } from "@/hooks/useColors";

/** Subtle tiled overlay on web empty / chat panes (WhatsApp doodle feel). */
export function ChatWallpaperPattern() {
  const colors = useColors();
  if (Platform.OS !== "web") return null;

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: colors.isDark ? 0.04 : 0.07,
          backgroundColor: colors.isDark ? "#8696A0" : "#7A8A92",
        },
      ]}
    />
  );
}
