import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAssistant } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";

export function AssistantOverlay() {
  const colors = useColors();
  const { phase, transcript, lastResponse, lastError, dismiss } = useAssistant();
  const pulse = useRef(new Animated.Value(0.4)).current;
  const visible = phase !== "idle";

  useEffect(() => {
    if (!visible || phase !== "listening") {
      pulse.setValue(0.4);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, phase, pulse]);

  if (!visible) return null;

  const title =
    phase === "listening"
      ? "Listening…"
      : phase === "processing"
        ? "Working on it…"
        : phase === "speaking"
          ? "Videh"
          : "Hey Videh";

  const subtitle =
    phase === "listening"
      ? "Boliye — jaise: “Videh ko call karo” ya “aaj kis ka message aaya”"
      : phase === "processing"
        ? "Thodi der…"
        : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Animated.View style={[styles.iconRing, phase === "listening" && { opacity: pulse }]}>
            {phase === "processing" ? (
              <ActivityIndicator size="large" color="#00A884" />
            ) : (
              <Ionicons name="mic" size={34} color="#00A884" />
            )}
          </Animated.View>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
          ) : null}
          {transcript ? (
            <Text style={[styles.transcript, { color: colors.mutedForeground }]} numberOfLines={4}>
              {transcript}
            </Text>
          ) : null}
          {lastError ? (
            <Text style={[styles.error, { color: "#c62828" }]} numberOfLines={3}>
              {lastError}
            </Text>
          ) : null}
          {lastResponse && (phase === "speaking" || phase === "processing") ? (
            <Text style={[styles.response, { color: colors.foreground }]} numberOfLines={5}>
              {lastResponse}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.closeBtn} onPress={dismiss}>
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0,168,132,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 6, textAlign: "center" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 10, lineHeight: 18 },
  transcript: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 8 },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center", marginBottom: 8 },
  response: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 4, lineHeight: 21 },
  closeBtn: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 20 },
  closeText: { color: "#00A884", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
