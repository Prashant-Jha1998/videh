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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

const SWIPE_ACCEPT_DY = -48;

export function IncomingCallOverlay({ call, onAccept, onDecline, onDeclineWithMessage }: Props) {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;
  const swipeY = useRef(new Animated.Value(0)).current;
  const acceptedRef = useRef(false);

  useEffect(() => {
    acceptedRef.current = false;
    swipeY.setValue(0);
  }, [call.callId, swipeY]);

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
        swipeY.setValue(Math.max(-56, Math.min(0, g.dy)));
      },
      onPanResponderRelease: (_, g) => {
        const swipedUp = g.dy <= SWIPE_ACCEPT_DY || g.vy < -0.45;
        if (swipedUp && !acceptedRef.current) {
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

  const callTypeLabel =
    call.type === "video" ? "Incoming video call" : "Incoming voice call";
  const subtitle =
    call.participantCount > 2
      ? `${call.participantCount} participants · Videh call`
      : callTypeLabel;

  return (
    <Modal visible key={call.callId} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12) + 28 }]}>
        <View style={styles.header}>
          <Animated.View style={[styles.avatarRing, { transform: [{ scale: pulse }] }]}>
            <View style={[styles.avatar, { backgroundColor: `hsl(${hue},48%,42%)` }]}>
              <Text style={styles.avatarTxt}>{initials}</Text>
            </View>
          </Animated.View>
          <Text style={styles.name}>{call.callerName}</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>

        <View style={styles.middle}>
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
                <Text style={styles.quickTxt} numberOfLines={2}>
                  {msg}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.swipeHint}>Swipe up on Accept to answer, or tap Accept</Text>
          <View style={styles.actions}>
            <View style={styles.actionItem}>
              <TouchableOpacity style={styles.declineCircle} onPress={onDecline} activeOpacity={0.85}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.actionLbl}>Decline</Text>
            </View>
            <View style={styles.actionItem}>
              <Animated.View
                style={[styles.acceptSwipeCol, { transform: [{ translateY: swipeY }] }]}
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
                <Text style={styles.actionLblGreen}>Accept</Text>
              </Animated.View>
            </View>
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
    justifyContent: "flex-start",
    paddingHorizontal: 28,
    paddingTop: 48,
  },
  header: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 0,
  },
  middle: { width: "100%", marginBottom: 20 },
  footer: { width: "100%", paddingHorizontal: 12, alignItems: "center", marginTop: "auto" },
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
  quickRow: { flexDirection: "row", gap: 10, width: "100%" },
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 16,
    maxWidth: 280,
  },
  actionItem: { alignItems: "center", minWidth: 88, minHeight: 96, justifyContent: "flex-end" },
  acceptSwipeCol: { alignItems: "center", gap: 10 },
  declineCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F15C6D",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#00A884",
    alignItems: "center",
    justifyContent: "center",
  },
  swipeHint: {
    color: "#8696A0",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  actionLbl: { color: "#E9EDEF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  actionLblGreen: { color: "#00A884", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
