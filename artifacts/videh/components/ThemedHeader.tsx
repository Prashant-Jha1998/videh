import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { headerTopInset } from "@/lib/headerInset";

type ThemedHeaderProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Per-chat accent (e.g. chat theme screen); falls back to global app theme. */
  accentColors?: [string, string];
};

export function ThemedHeader({ children, style, accentColors }: ThemedHeaderProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const themeColors = accentColors ?? colors.appThemeColors;
  const [start, end] = themeColors;
  const isGradient = start.toLowerCase() !== end.toLowerCase();
  const headerBg = accentColors ? start : colors.headerBg;

  const flat = StyleSheet.flatten(style) ?? {};
  const passedTop = typeof flat.paddingTop === "number" ? flat.paddingTop : 0;
  const webExtra = Platform.OS === "web" ? Math.max(0, passedTop - insets.top) : 0;
  const resolvedTop = Math.max(passedTop, headerTopInset(insets, webExtra));
  const resolvedStyle = [{ ...flat, paddingTop: resolvedTop }];

  if (!isGradient) {
    return <View style={[{ backgroundColor: headerBg }, resolvedStyle]}>{children}</View>;
  }

  return (
    <LinearGradient
      colors={themeColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={resolvedStyle}
    >
      {children}
    </LinearGradient>
  );
}
