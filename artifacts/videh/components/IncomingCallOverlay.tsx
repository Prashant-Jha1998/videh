import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CALL_DECLINE_QUICK_MESSAGES } from "@/lib/callDeclineQuickMessages";

export type IncomingCallInfo = {
  callId: string;
  channel: string;
  chatId: number;
  type: "audio" | "video";
  callerName: string;
  participantCount: number;
};

type Props = {
  call: IncomingCallInfo;
  onAccept: () => void;
  onDecline: () => void;
  onDeclineWithMessage: (text: string) => void;
};

const SWIPE_ACCEPT_DY = -72;

export function IncomingCallOverlay({ call, onAccept, onDecline, onDeclineWithMessage }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;
  const swipeY = useRef(new Animated.Value(0)).current;
  const acceptedRef = useRef(false);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        swipeY.setValue(Math.min(0, g.dy));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy <= SWIPE_ACCEPT_DY && !acceptedRef.current) {
          acceptedRef.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onAccept();
        }
        Animated.spring(swipeY, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeY, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const initials = call.callerName
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
  const hue = (call.callerName.charCodeAt(0) || 32) * 37 % 360;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.root}>
        <Text style={styles.label}>
          {call.type === "video" ? "Incoming video call" : "Incoming voice call"}
        </Text>
        <Animated.View style={[styles.avatarRing, { transform: [{ scale: pulse }] }]}>
          <View style={[styles.avatar, { backgroundColor: `hsl(${hue},48%,42%)` }]}>
            <Text style={styles.avatarTxt}>{initials}</Text>
          </View>
        </Animated.View>
        <Text style={styles.name}>{call.callerName}</Text>
        <Text style={styles.sub}>
          {call.participantCount > 2
            ? `${call.participantCount} participants · Videh call`
            : "Videh voice & video call"}
        </Text>

        <View style={styles.quickRow}>
          {CALL_DECLINE_QUICK_MESSAGES.slice(0, 2).map((msg) => (
            <TouchableOpacity
              key={msg}
              style={styles.quickChip}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDeclineWithMessage(msg);
              }}
            >
              <Text style={styles.quickTxt} numberOfLines={2}>{msg}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.declineBtn} onPress={onDecline} activeOpacity={0.85}>
            <Ionicons name="close" size={28} color="#fff" />
            <Text style={styles.actionLbl}>Decline</Text>
          </TouchableOpacity>

          <View style={styles.acceptCol}>
            <Text style={styles.swipeHint}>Swipe up to answer</Text>
            <Animated.View
              style={[styles.acceptSwipe, { transform: [{ translateY: swipeY }] }]}
              {...panResponder.panHandlers}
            >
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => {
                  if (acceptedRef.current) return;
                  acceptedRef.current = true;
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  onAccept();
                }}
                activeOpacity={0.9}
              >
                <Ionicons name="call" size={28} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
            <Text style={styles.actionLblGreen}>Accept</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B141A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 48,
  },
  label: { color: "#8696A0", fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 28 },
  avatarRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: "rgba(0,168,132,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  avatar: { width: 112, height: 112, borderRadius: 56, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontSize: 40, fontFamily: "Inter_700Bold" },
  name: { color: "#E9EDEF", fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center" },
  sub: { color: "#8696A0", fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center" },
  quickRow: { flexDirection: "row", gap: 10, marginTop: 28, width: "100%" },
  quickChip: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  quickTxt: { color: "#AEBAC1", fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  actions: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 36,
    paddingHorizontal: 12,
  },
  declineBtn: { alignItems: "center", gap: 8 },
  acceptCol: { alignItems: "center", gap: 8 },
  acceptSwipe: { alignItems: "center" },
  acceptBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#00A884",
    alignItems: "center",
    justifyContent: "center",
  },
  swipeHint: { color: "#8696A0", fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 4 },
  actionLbl: { color: "#E9EDEF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  actionLblGreen: { color: "#00A884", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
