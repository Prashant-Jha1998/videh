import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

type Props = {
  label?: string;
  bubbleColor: string;
  dotColor: string;
  textColor: string;
};

/** Small incoming-message-style bubble with animated dots (WhatsApp-like). */
export function TypingIndicator({ label, bubbleColor, dotColor, textColor }: Props) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 320, useNativeDriver: true }),
        ]),
      );
    const l1 = loop(a, 0);
    const l2 = loop(b, 120);
    const l3 = loop(c, 240);
    l1.start();
    l2.start();
    l3.start();
    return () => {
      l1.stop();
      l2.stop();
      l3.stop();
    };
  }, [a, b, c]);

  const dotStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
  });

  return (
    <View style={styles.wrap}>
      <View style={[styles.bubble, { backgroundColor: bubbleColor }]}>
        <Animated.View style={[styles.dot, { backgroundColor: dotColor }, dotStyle(a)]} />
        <Animated.View style={[styles.dot, { backgroundColor: dotColor }, dotStyle(b)]} />
        <Animated.View style={[styles.dot, { backgroundColor: dotColor }, dotStyle(c)]} />
      </View>
      {label ? <Text style={[styles.label, { color: textColor }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingBottom: 6, paddingTop: 4, flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
});
