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
import { useAgoraCall } from "@/hooks/useAgoraCall";
import { useAppContext } from "@/context/AppContext";
import { AgoraLocalView, AgoraRemoteView } from "@/components/AgoraVideoView";

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, name, type } = useLocalSearchParams<{ id: string; name: string; type: string }>();
  const { user } = useAppContext();
  const isVideo = type === "video";

  const channelName = `videh_${id ?? "default"}`;
  const numericUid = Math.abs((user?.dbId ?? 0) % 999999) || Math.floor(Math.random() * 99999) + 1;

  const {
    joined,
    error,
    muted,
    cameraOff,
    speakerOn,
    remoteCount,
    localVideoId,
    remoteVideoId,
    hasRemoteVideo,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    leave,
    ...rest
  } = useAgoraCall(channelName, numericUid, isVideo);

  const remoteUid: number | null = (rest as any).remoteUid ?? null;

  const [duration, setDuration] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const needsDevBuild = error === "EXPO_GO";

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    if (!joined) anim.start();
    else anim.stop();
    return () => anim.stop();
  }, [joined]);

  useEffect(() => {
    if (!joined) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [joined]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const endCall = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await leave();
    router.back();
  };

  const initials = (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (name ?? "?").charCodeAt(0) * 37 % 360;
  const avatarBg = `hsl(${hue},50%,45%)`;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const statusText = needsDevBuild
    ? "Install Videh app to call"
    : error && !needsDevBuild
    ? `Error: ${error}`
    : joined
    ? remoteCount > 0
      ? formatDuration(duration)
      : "Waiting for other party..."
    : isVideo ? "Video calling..." : "Ringing...";

  const showVideoUI = isVideo && !needsDevBuild && !error;

  return (
    <View style={[styles.container, { backgroundColor: isVideo ? "#0B141A" : "#1A1A2E", paddingTop: topPad, paddingBottom: insets.bottom + 30 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={router.back}>
        <Ionicons name="chevron-down" size={28} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
      <Text style={styles.callTypeLabel}>{isVideo ? "Videh Video Call" : "Videh Voice Call"}</Text>

      {needsDevBuild ? (
        <View style={styles.center}>
          <View style={styles.devCard}>
            <Ionicons name="call" size={48} color="#00A884" />
            <Text style={styles.devCardTitle}>Videh Calls</Text>
            <Text style={styles.devCardText}>
              Voice and video calls are fully supported in the Videh app.
              Install the Videh app on your phone to make and receive calls.
            </Text>
            <View style={styles.devCardBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#a3e635" />
              <Text style={styles.devCardBadgeText}>End-to-end encrypted</Text>
            </View>
          </View>
        </View>
      ) : showVideoUI ? (
        <View style={styles.videoContainer}>
          {(Platform.OS === "web" ? hasRemoteVideo : remoteUid !== null) ? (
            Platform.OS === "web"
              ? <AgoraRemoteView style={styles.remoteVideo} nativeId={remoteVideoId} />
              : <AgoraRemoteView uid={remoteUid ?? 0} style={styles.remoteVideo} />
          ) : (
            <View style={[styles.remoteVideo, styles.videoPlaceholder]}>
              <Animated.View style={[styles.avatarRing, { borderColor: avatarBg, transform: [{ scale: !joined ? pulse : 1 }] }]}>
                <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              </Animated.View>
              <Text style={styles.callerName}>{name}</Text>
              <Text style={styles.callStatus}>{statusText}</Text>
            </View>
          )}
          {joined && !cameraOff && (
            <View style={styles.localVideoWrapper}>
              {Platform.OS === "web"
                ? <AgoraLocalView style={styles.localVideoFill} nativeId={localVideoId} />
                : <AgoraLocalView style={styles.localVideoFill} />
              }
            </View>
          )}
        </View>
      ) : (
        <View style={styles.center}>
          <Animated.View style={[styles.avatarRing, { borderColor: avatarBg, transform: [{ scale: !joined ? pulse : 1 }] }]}>
            <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </Animated.View>
          <Text style={styles.callerName}>{name}</Text>
          <Text style={styles.callStatus}>{statusText}</Text>
          {joined && (
            <View style={styles.encryptBadge}>
              <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.encryptText}>End-to-end encrypted</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.controls}>
        <View style={styles.controlsRow}>
          <ControlBtn
            icon={muted ? "mic-off" : "mic"}
            label={muted ? "Unmute" : "Mute"}
            onPress={() => { toggleMute(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            active={muted}
          />
          <ControlBtn
            icon={speakerOn ? "volume-high" : "volume-medium"}
            label="Speaker"
            onPress={() => { toggleSpeaker(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            active={speakerOn}
          />
          {isVideo && (
            <ControlBtn
              icon={cameraOff ? "videocam-off" : "videocam"}
              label="Camera"
              onPress={() => { toggleCamera(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              active={cameraOff}
            />
          )}
          <ControlBtn icon="chatbubble-outline" label="Message" onPress={router.back} active={false} />
        </View>

        <TouchableOpacity style={styles.endBtn} onPress={endCall} activeOpacity={0.85}>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  videoContainer: { flex: 1, width: "100%", position: "relative" },
  remoteVideo: { flex: 1, width: "100%", backgroundColor: "#111" },
  videoPlaceholder: { alignItems: "center", justifyContent: "center" },
  localVideoWrapper: { position: "absolute", top: 12, right: 12, width: 90, height: 120, borderRadius: 10, overflow: "hidden", borderWidth: 2, borderColor: "rgba(255,255,255,0.3)" },
  localVideoFill: { flex: 1, backgroundColor: "#222" },
  avatarRing: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  avatar: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 44, fontFamily: "Inter_700Bold" },
  callerName: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold", marginBottom: 8 },
  callStatus: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontFamily: "Inter_400Regular" },
  encryptBadge: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, backgroundColor: "rgba(255,255,255,0.08)", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20 },
  encryptText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_400Regular" },
  controls: { width: "100%", alignItems: "center", paddingHorizontal: 24, gap: 32 },
  controlsRow: { flexDirection: "row", justifyContent: "space-around", width: "100%" },
  ctrlBtn: { alignItems: "center", gap: 8 },
  ctrlIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  ctrlActive: { backgroundColor: "rgba(255,255,255,0.9)" },
  ctrlLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_400Regular" },
  endBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" },
  devCard: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 20, padding: 28, alignItems: "center", gap: 14, maxWidth: 340 },
  devCardTitle: { color: "#00A884", fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  devCardText: { color: "rgba(255,255,255,0.80)", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  devCardBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.35)", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, marginTop: 4 },
  devCardBadgeText: { color: "#a3e635", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
