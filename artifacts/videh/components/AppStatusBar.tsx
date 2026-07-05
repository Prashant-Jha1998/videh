import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { useColors } from "@/hooks/useColors";

/** Light headers use dark status-bar icons on white; themed/dark headers use light icons. */
export function AppStatusBar() {
  const colors = useColors();
  const barBg = colors.headerBg ?? colors.background;
  const iconStyle = colors.shellThemed || colors.isDark ? "light" : "dark";

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(barBg);
  }, [barBg]);

  return (
    <StatusBar
      style={iconStyle}
      backgroundColor={barBg}
      translucent={Platform.OS === "android"}
    />
  );
}
