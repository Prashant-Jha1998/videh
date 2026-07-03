import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { AnimatedWallpaperId } from "@/lib/themeAppearance";

type Props = {
  id: AnimatedWallpaperId;
  accent?: string;
  isDark?: boolean;
};

const PRESETS: Record<
  Exclude<AnimatedWallpaperId, "none">,
  { colors: string[][]; duration: number }
> = {
  aurora: {
    colors: [
      ["#0F172A", "#312E81", "#0F766E"],
      ["#1E1B4B", "#7C3AED", "#0891B2"],
      ["#0F172A", "#BE185D", "#0D9488"],
    ],
    duration: 12000,
  },
  "neon-pulse": {
    colors: [
      ["#020617", "#14532D", "#0F172A"],
      ["#022C22", "#22C55E", "#020617"],
      ["#020617", "#064E3B", "#0F172A"],
    ],
    duration: 8000,
  },
  "sunset-flow": {
    colors: [
      ["#1C1917", "#9A3412", "#831843"],
      ["#292524", "#EA580C", "#BE185D"],
      ["#1C1917", "#F97316", "#7C3AED"],
    ],
    duration: 10000,
  },
  "amoled-glow": {
    colors: [
      ["#000000", "#111827", "#000000"],
      ["#000000", "#1F2937", "#000000"],
      ["#000000", "#0F172A", "#000000"],
    ],
    duration: 14000,
  },
  "festival-lights": {
    colors: [
      ["#1E1B4B", "#CA8A04", "#BE185D"],
      ["#312E81", "#22C55E", "#F97316"],
      ["#4C1D95", "#EAB308", "#DB2777"],
    ],
    duration: 9000,
  },
};

export function AnimatedChatWallpaper({ id, accent, isDark }: Props) {
  const phase = useSharedValue(0);

  useEffect(() => {
    if (id === "none") return;
    phase.value = 0;
    phase.value = withRepeat(
      withTiming(1, { duration: PRESETS[id]?.duration ?? 10000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [id, phase]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + phase.value * 0.25,
    transform: [{ scale: 1 + phase.value * 0.04 }],
  }));

  if (id === "none") return null;

  const preset = PRESETS[id];
  if (!preset) return null;

  const base = isDark ? "#12101F" : "#EDEAF5";
  const tint = accent ?? "#059669";

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[base, mixWith(base, tint, 0.15)]}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
        <LinearGradient
          colors={preset.colors[0] as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

function mixWith(base: string, tint: string, amount: number): string {
  const b = parse(base);
  const t = parse(tint);
  if (!b || !t) return base;
  return `#${[0, 1, 2]
    .map((i) => Math.round(b[i] + (t[i] - b[i]) * amount))
    .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function parse(hex: string): [number, number, number] | null {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
