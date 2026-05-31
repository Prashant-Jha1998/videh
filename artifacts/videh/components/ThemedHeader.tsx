import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/useColors";

type ThemedHeaderProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Per-chat accent (e.g. chat theme screen); falls back to global app theme. */
  accentColors?: [string, string];
};

export function ThemedHeader({ children, style, accentColors }: ThemedHeaderProps) {
  const colors = useColors();
  const themeColors = accentColors ?? colors.appThemeColors;
  const [start, end] = themeColors;
  const isGradient = start.toLowerCase() !== end.toLowerCase();
  const headerBg = accentColors ? start : colors.headerBg;

  if (!isGradient) {
    return <View style={[style, { backgroundColor: headerBg }]}>{children}</View>;
  }

  return (
    <LinearGradient
      colors={themeColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
