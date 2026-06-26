import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { STATUS_RING_GREEN, STATUS_RING_GREY } from "@/lib/statusRingSegments";

const GAP_DEG = 6;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

type StoryRingProps = {
  size?: number;
  strokeWidth?: number;
  /** true = viewed (grey), false = unviewed (green). */
  segments: boolean[];
  /** Used for single-segment rings (e.g. my status). Defaults to green/grey. */
  activeColor?: string;
  style?: StyleProp<ViewStyle>;
};

export function StoryRing({
  size = 54,
  strokeWidth = 2.5,
  segments,
  activeColor = STATUS_RING_GREEN,
  style,
}: StoryRingProps) {
  const count = segments.length;
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;

  if (count === 0) return null;

  if (count === 1) {
    const color = segments[0] ? STATUS_RING_GREY : activeColor;
    return (
      <View style={[styles.wrap, { width: size, height: size }, style]}>
        <Svg width={size} height={size}>
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
          />
        </Svg>
      </View>
    );
  }

  const segmentSweep = (360 - count * GAP_DEG) / count;

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        {segments.map((viewed, i) => {
          const start = -90 + i * (segmentSweep + GAP_DEG);
          const end = start + segmentSweep;
          return (
            <Path
              key={i}
              d={describeArc(cx, cy, radius, start, end)}
              stroke={viewed ? STATUS_RING_GREY : activeColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
    </View>
  );
}

type StoryRingAvatarProps = {
  size?: number;
  strokeWidth?: number;
  segments: boolean[];
  activeColor?: string;
  children: React.ReactNode;
  badgeCount?: number;
  badgeColor?: string;
  style?: StyleProp<ViewStyle>;
};

/** Avatar with Videh-style segmented status ring behind it. */
export function StoryRingAvatar({
  size = 54,
  strokeWidth = 2.5,
  segments,
  activeColor,
  children,
  badgeCount,
  badgeColor = "#5B4FE8",
  style,
}: StoryRingAvatarProps) {
  return (
    <View style={[styles.avatarWrap, { width: size, height: size }, style]}>
      <StoryRing
        size={size}
        strokeWidth={strokeWidth}
        segments={segments}
        activeColor={activeColor}
        style={styles.ringBehind}
      />
      {children}
      {badgeCount != null && badgeCount > 1 ? (
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>{badgeCount > 9 ? "9+" : badgeCount}</Text>
        </View>
      ) : null}
    </View>
  );
}


const styles = StyleSheet.create({
  wrap: { position: "relative" },
  avatarWrap: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  ringBehind: {
    ...StyleSheet.absoluteFillObject,
  },
  badge: {
    position: "absolute",
    bottom: -2,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
});
