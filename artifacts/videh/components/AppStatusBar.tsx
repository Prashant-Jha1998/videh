import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { useColors } from "@/hooks/useColors";

/** Light headers use dark status-bar icons on white; dark mode keeps light icons. */
export function AppStatusBar() {
  const colors = useColors();
  const barBg = colors.headerBg ?? colors.background;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(barBg);
  }, [barBg]);

  return (
    <StatusBar
      style={colors.isDark ? "light" : "dark"}
      backgroundColor={barBg}
      translucent={Platform.OS === "android"}
    />
  );
}
