import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAssistant } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";

export function AssistantOverlay() {
  const colors = useColors();
  const { phase, transcript, lastResponse, dismiss } = useAssistant();
  const visible = phase !== "idle";

  if (!visible) return null;

  const title =
    phase === "wake" ? "Verifying your voice..."
    : phase === "listening" ? "Sun raha hoon..."
    : phase === "processing" ? "Processing..."
    : phase === "speaking" ? "Videh bol raha hai"
    : "Hey Videh";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.iconRing}>
            {phase === "processing" || phase === "wake" ? (
              <ActivityIndicator size="large" color="#00A884" />
            ) : (
              <Ionicons name="mic" size={34} color="#00A884" />
            )}
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          {transcript ? (
            <Text style={[styles.transcript, { color: colors.mutedForeground }]} numberOfLines={3}>
              {transcript}
            </Text>
          ) : null}
          {lastResponse && phase === "speaking" ? (
            <Text style={[styles.response, { color: colors.foreground }]} numberOfLines={4}>
              {lastResponse}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.closeBtn} onPress={dismiss}>
            <Text style={styles.closeText}>Band karein</Text>
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
  title: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" },
  transcript: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 8 },
  response: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 4 },
  closeBtn: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 20 },
  closeText: { color: "#00A884", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
