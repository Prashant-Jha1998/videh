import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import {
  Alert,
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
  /** Videh invite caller user id — required for correct WebRTC offer/answer roles. */
  callerId?: number;
  avatarUrl?: string | null;
};

type Props = {
  call: IncomingCallInfo;
  onAccept: () => void | Promise<void>;
  onDecline: () => void;
  onDeclineWithMessage: (text: string) => void;
};

const SWIPE_ACCEPT_DY = -48;
const AVATAR = 168;

export function IncomingCallOverlay({ call, onAccept, onDecline, onDeclineWithMessage }: Props) {
  const insets = useSafeAreaInsets();
  const swipeY = useRef(new Animated.Value(0)).current;
  const chevron = useRef(new Animated.Value(0)).current;
  const acceptedRef = useRef(false);
  const busyRef = useRef(false);

  const runAccept = () => {
    if (acceptedRef.current || busyRef.current) return;
    acceptedRef.current = true;
    busyRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void Promise.resolve(onAccept())
      .catch(() => {
        acceptedRef.current = false;
      })
      .finally(() => {
        busyRef.current = false;
      });
  };

  const runDecline = (fn: () => void | Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void Promise.resolve(fn()).finally(() => {
      busyRef.current = false;
    });
  };

  useEffect(() => {
    acceptedRef.current = false;
    busyRef.current = false;
    swipeY.setValue(0);
  }, [call.callId, swipeY]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(chevron, { toValue: -6, duration: 700, useNativeDriver: true }),
        Animated.timing(chevron, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [chevron]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        swipeY.setValue(Math.max(-72, Math.min(0, g.dy)));
      },
      onPanResponderRelease: (_, g) => {
        const swipedUp = g.dy <= SWIPE_ACCEPT_DY || g.vy < -0.45;
        if (swipedUp && !acceptedRef.current) {
          runAccept();
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

  const callTypeLabel = call.type === "video" ? "Videh video call" : "Videh voice call";

  const openMessageOptions = () => {
    Alert.alert(
      "Reply with message",
      undefined,
      [
        ...CALL_DECLINE_QUICK_MESSAGES.map((msg) => ({
          text: msg,
          onPress: () => runDecline(() => onDeclineWithMessage(msg)),
        })),
        { text: "Decline without message", style: "destructive" as const, onPress: () => runDecline(onDecline) },
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  };

  return (
    <Modal
      visible
      key={call.callId}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDecline}
    >
      <View style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
        <View style={styles.top}>
          <Text style={styles.name} numberOfLines={2}>
            {call.callerName}
          </Text>
          <Text style={styles.sub}>{callTypeLabel}</Text>
        </View>

        <View style={styles.center}>
          {call.avatarUrl ? (
            <Image source={{ uri: call.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: `hsl(${hue},48%,42%)` }]}>
              <Text style={styles.avatarTxt}>{initials}</Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.actionCol}>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => runDecline(onDecline)}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={26} color="#fff" style={styles.declineIcon} />
            </TouchableOpacity>
            <Text style={styles.actionLbl}>Decline</Text>
          </View>

          <View style={styles.actionCol}>
            <Animated.View style={[styles.acceptCol, { transform: [{ translateY: swipeY }] }]} {...panResponder.panHandlers}>
              <Animated.View style={{ transform: [{ translateY: chevron }] }}>
                <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.55)" />
                <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.35)" style={{ marginTop: -10 }} />
              </Animated.View>
              <TouchableOpacity style={styles.acceptBtn} onPress={runAccept} activeOpacity={0.9}>
                <Ionicons name="call" size={26} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.swipeLbl}>Swipe up to accept</Text>
            </Animated.View>
          </View>

          <View style={styles.actionCol}>
            <TouchableOpacity
              style={styles.messageBtn}
              onPress={openMessageOptions}
              activeOpacity={0.85}
            >
              <Ionicons name="chatbox-ellipses-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.actionLbl}>Message</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#12101F",
    alignItems: "center",
  },
  top: {
    alignItems: "center",
    paddingHorizontal: 28,
    width: "100%",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 28,
    maxWidth: 400,
  },
  name: {
    color: "#F0F2F5",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  sub: {
    color: "#8696A0",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    textAlign: "center",
  },
  avatarImg: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: {
    color: "#fff",
    fontSize: 52,
    fontFamily: "Inter_700Bold",
  },
  actionCol: {
    flex: 1,
    alignItems: "center",
    minHeight: 120,
    justifyContent: "flex-end",
  },
  acceptCol: {
    alignItems: "center",
    gap: 8,
  },
  declineBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#F15C6D",
    alignItems: "center",
    justifyContent: "center",
  },
  declineIcon: {
    transform: [{ rotate: "135deg" }],
  },
  acceptBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#5B4FE8",
    alignItems: "center",
    justifyContent: "center",
  },
  messageBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLbl: {
    color: "#E9EDEF",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  swipeLbl: {
    color: "#8696A0",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 88,
  },
});
