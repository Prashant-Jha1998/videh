import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";

type Props = {
  visible: boolean;
  currentContactName: string;
  incoming: IncomingCallInfo;
  onHoldAndAnswer: () => void;
  onEndAndAnswer: () => void;
  onDecline: () => void;
};

/** Videh call waiting while already on a call. */
export function CallWaitingOverlay({
  visible,
  currentContactName,
  incoming,
  onHoldAndAnswer,
  onEndAndAnswer,
  onDecline,
}: Props) {
  const label = incoming.type === "video" ? "video call" : "voice call";

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Ionicons name="call" size={28} color="#059669" style={{ marginBottom: 12 }} />
          <Text style={styles.title}>Call waiting</Text>
          <Text style={styles.body}>
            {incoming.callerName} is calling while you are on a call with {currentContactName}.
          </Text>
          <Text style={styles.sub}>Incoming {label}</Text>

          <TouchableOpacity style={styles.holdBtn} onPress={onHoldAndAnswer} activeOpacity={0.85}>
            <Text style={styles.holdTxt}>Hold & answer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={onEndAndAnswer} activeOpacity={0.85}>
            <Text style={styles.secondaryTxt}>End current & answer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.declineBtn} onPress={onDecline} activeOpacity={0.85}>
            <Text style={styles.declineTxt}>Decline incoming</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: "#1E1D2E",
    borderRadius: 16,
    padding: 22,
    alignItems: "center",
  },
  title: { color: "#E9EDEF", fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 8 },
  body: { color: "#8696A0", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  sub: { color: "#059669", fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 10, marginBottom: 20 },
  holdBtn: {
    width: "100%",
    backgroundColor: "#059669",
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  holdTxt: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  secondaryBtn: {
    width: "100%",
    backgroundColor: "rgba(0,168,132,0.2)",
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  secondaryTxt: { color: "#059669", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  declineBtn: {
    width: "100%",
    backgroundColor: "rgba(241,92,109,0.2)",
    borderRadius: 28,
    paddingVertical: 14,
    alignItems: "center",
  },
  declineTxt: { color: "#F15C6D", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
