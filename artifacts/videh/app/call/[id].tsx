import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function CallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, name, type } = useLocalSearchParams<{ id: string; name: string; type: string }>();
  const isVideo = type === "video";

  const [callState, setCallState] = useState<"ringing" | "connected" | "ended">("ringing");
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulse animation for ringing
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();

    // Auto-connect after 2.5s
    const t = setTimeout(() => {
      setCallState("connected");
      anim.stop();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 2500);

    return () => { clearTimeout(t); anim.stop(); };
  }, []);

  useEffect(() => {
    if (callState !== "connected") return;
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const endCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.back();
  };

  const initials = (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (name ?? "?").charCodeAt(0) * 37 % 360;
  const avatarBg = `hsl(${hue},50%,45%)`;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: isVideo ? "#0B141A" : "#1A1A2E", paddingTop: topPad, paddingBottom: insets.bottom + 30 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={router.back}>
        <Ionicons name="chevron-down" size={28} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>

      <Text style={styles.callTypeLabel}>{isVideo ? "Videh Video Call" : "Videh Voice Call"}</Text>

      <View style={styles.center}>
        <Animated.View style={[styles.avatarRing, { borderColor: avatarBg, transform: [{ scale: callState === "ringing" ? pulse : 1 }] }]}>
          <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        </Animated.View>
        <Text style={styles.callerName}>{name}</Text>
        <Text style={styles.callStatus}>
          {callState === "ringing" ? (isVideo ? "Video calling..." : "Ringing...") : callState === "connected" ? formatDuration(duration) : "Call ended"}
        </Text>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlsRow}>
          <ControlBtn icon={muted ? "mic-off" : "mic"} label={muted ? "Unmute" : "Mute"} onPress={() => { setMuted((m) => !m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} active={muted} />
          <ControlBtn icon={speakerOn ? "volume-high" : "volume-medium"} label="Speaker" onPress={() => { setSpeakerOn((s) => !s); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} active={speakerOn} />
          {isVideo && <ControlBtn icon={cameraOff ? "videocam-off" : "videocam"} label="Camera" onPress={() => { setCameraOff((c) => !c); }} active={cameraOff} />}
          <ControlBtn icon="chatbubble-outline" label="Message" onPress={router.back} active={false} />
        </View>

        <TouchableOpacity style={styles.endBtn} onPress={endCall}>
          <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ControlBtn({ icon, label, onPress, active }: { icon: string; label: string; onPress: () => void; active: boolean }) {
  return (
    <TouchableOpacity style={styles.ctrlBtn} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.ctrlIcon, active && styles.ctrlActive]}>
        <Ionicons name={icon as any} size={22} color={active ? "#000" : "#fff"} />
      </View>
      <Text style={styles.ctrlLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center" },
  backBtn: { alignSelf: "flex-start", padding: 16 },
  callTypeLabel: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: -8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  avatarRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  avatar: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 44, fontFamily: "Inter_700Bold" },
  callerName: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold", marginBottom: 8 },
  callStatus: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontFamily: "Inter_400Regular" },
  controls: { width: "100%", alignItems: "center", paddingHorizontal: 24, gap: 32 },
  controlsRow: { flexDirection: "row", justifyContent: "space-around", width: "100%" },
  ctrlBtn: { alignItems: "center", gap: 8 },
  ctrlIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  ctrlActive: { backgroundColor: "rgba(255,255,255,0.9)" },
  ctrlLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_400Regular" },
  endBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" },
});
