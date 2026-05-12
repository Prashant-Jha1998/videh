import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useColors } from "@/hooks/useColors";

type ThemedHeaderProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ThemedHeader({ children, style }: ThemedHeaderProps) {
  const colors = useColors();
  const [start, end] = colors.appThemeColors;
  const isGradient = start.toLowerCase() !== end.toLowerCase();

  if (!isGradient) {
    return <View style={[style, { backgroundColor: colors.headerBg }]}>{children}</View>;
  }

  return (
    <LinearGradient
      colors={colors.appThemeColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
