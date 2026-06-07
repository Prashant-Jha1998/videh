import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { useColors } from "@/hooks/useColors";

/**
 * Keeps system status bar icons readable: light icons on the branded header color
 * (WhatsApp / YouTube style) instead of washed-out icons on a white strip.
 */
export function AppStatusBar() {
  const colors = useColors();
  const barBg = colors.headerBg ?? colors.primary;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(barBg);
  }, [barBg]);

  return (
    <StatusBar
      style="light"
      backgroundColor={barBg}
      translucent={Platform.OS === "android"}
    />
  );
}
