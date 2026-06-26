import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse } from "react-native-svg";

const WA_GREEN = "#5B4FE8";

/** Videh header illustration for disappearing messages. */
export function DisappearMessagesIllustration() {
  return (
    <View style={styles.wrap}>
      <Svg width={200} height={120} viewBox="0 0 200 120">
        <Ellipse cx="100" cy="78" rx="72" ry="28" fill="#E7F8F1" />
        <Circle cx="58" cy="52" r="22" fill="#D4F4E8" opacity={0.9} />
        <Circle cx="148" cy="44" r="16" fill="#E8FAF3" />
        <Circle cx="132" cy="68" r="10" fill="#F0FBF7" />
      </Svg>
      <View style={styles.timerCircle}>
        <Ionicons name="timer-outline" size={36} color="#fff" />
      </View>
      <View style={styles.bubble} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  timerCircle: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: WA_GREEN,
    alignItems: "center",
    justifyContent: "center",
    top: 28,
    shadowColor: WA_GREEN,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bubble: {
    position: "absolute",
    width: 36,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#FFF8E7",
    top: 22,
    left: "50%",
    marginLeft: -52,
    transform: [{ rotate: "-12deg" }],
    opacity: 0.85,
  },
});
