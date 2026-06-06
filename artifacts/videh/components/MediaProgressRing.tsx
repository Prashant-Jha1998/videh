import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

type Props = {
  size?: number;
  strokeWidth?: number;
  progress: number;
  trackColor?: string;
  progressColor?: string;
  children?: React.ReactNode;
};

/** WhatsApp-style circular progress (0–100). */
export function MediaProgressRing({
  size = 44,
  strokeWidth = 3,
  progress,
  trackColor = "rgba(0,0,0,0.12)",
  progressColor = "#00A884",
  children,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, progress));
  const offset = circumference * (1 - clamped / 100);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={progressColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
