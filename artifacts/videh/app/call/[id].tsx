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
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVidehCall } from "@/hooks/useVidehCall";
import { useApp } from "@/context/AppContext";
import { AgoraLocalView, AgoraRemoteView } from "@/components/AgoraVideoView";
import { getApiUrl } from "@/lib/api";

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, name, type, channel, callId, incoming } = useLocalSearchParams<{ id: string; name: string; type: string; channel?: string; callId?: string; incoming?: string }>();
  const { user } = useApp();
  const isVideo = type === "video";

  const [activeCallId, setActiveCallId] = useState(callId ?? "");
  const [activeChannel, setActiveChannel] = useState(channel ?? (incoming === "1" ? `videh_${id ?? "default"}` : ""));
  const [participantCount, setParticipantCount] = useState(1);
  const [acceptedCount, setAcceptedCount] = useState(1);
  const [ringingCount, setRingingCount] = useState(0);
  const numericUid = Math.abs((user?.dbId ?? 0) % 999999) || Math.floor(Math.random() * 99999) + 1;

  useEffect(() => {
    if (!id || !user?.dbId || incoming === "1" || channel) return;
    let cancelled = false;
    fetch(`${getApiUrl()}/api/webrtc/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: Number(id), callerId: user.dbId, type: isVideo ? "video" : "audio" }),
    })
      .then((res) => res.json())
      .then((data: { success?: boolean; call?: { channel?: string; callId?: string; participantCount?: number; acceptedCount?: number; ringingCount?: number } }) => {
        if (cancelled || !data.success || !data.call?.channel) return;
        setActiveChannel(data.call.channel);
        setActiveCallId(data.call.callId ?? "");
        setParticipantCount(data.call.participantCount ?? 1);
        setAcceptedCount(data.call.acceptedCount ?? 1);
        setRingingCount(data.call.ringingCount ?? 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id, user?.dbId, incoming, channel, isVideo]);

  const {
    joined,
    error,
    muted,
    cameraOff,
    speakerOn,
    remoteCount,
    hasRemoteVideo,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    leave,
    ...rest
  } = useVidehCall(activeChannel, numericUid, isVideo);

  const remoteUid: number | null = (rest as any).remoteUid ?? null;
  const localStreamUrl = (rest as any).localStreamUrl as string | undefined;
  const remoteStreamUrl = (rest as any).remoteStreamUrl as string | undefined;

  const [duration, setDuration] = useState(0);
  const pulse = useRef(new Animated.Value(1)).current;
  const needsDevBuild = error === "SELF_HOSTED_WEBRTC_NATIVE_REQUIRED";

  useEffect(() => {
    if (incoming === "1" || joined || error) {
      if (Platform.OS !== "web") Vibration.cancel();
      return;
    }
    if (Platform.OS !== "web") Vibration.vibrate([0, 450, 500], true);
    const timeout = setTimeout(() => {
      if (!joined) {
        if (activeCallId) fetch(`${getApiUrl()}/api/webrtc/calls/${activeCallId}/end`, { method: "POST" }).catch(() => {});
        router.back();
      }
    }, 60000);
    return () => {
      clearTimeout(timeout);
      if (Platform.OS !== "web") Vibration.cancel();
    };
  }, [incoming, joined, error, activeCallId]);

  useEffect(() => {
    if (!activeCallId || !user?.dbId) return;
    const timer = setInterval(() => {
      fetch(`${getApiUrl()}/api/webrtc/calls/${activeCallId}/status?userId=${user.dbId}`)
        .then((res) => res.json())
        .then((data: { success?: boolean; acceptedCount?: number; ringingCount?: number; call?: { participantCount?: number }; ended?: boolean }) => {
          if (!data.success) return;
          setAcceptedCount(data.acceptedCount ?? 1);
          setRingingCount(data.ringingCount ?? 0);
          setParticipantCount(data.call?.participantCount ?? participantCount);
          if (data.ended) router.back();
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [activeCallId, user?.dbId, participantCount]);

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
    if (activeCallId) {
      fetch(`${getApiUrl()}/api/webrtc/calls/${activeCallId}/end`, { method: "POST" }).catch(() => {});
    }
    router.back();
  };

  const initials = (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (name ?? "?").charCodeAt(0) * 37 % 360;
  const avatarBg = `hsl(${hue},50%,45%)`;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const statusText = needsDevBuild
    ? "Self-hosted call module required"
    : error && !needsDevBuild
    ? `Error: ${error}`
    : joined
    ? remoteCount > 0
      ? formatDuration(duration)
      : acceptedCount > 1
      ? "Connecting participants..."
      : "Waiting for other party..."
    : ringingCount > 1
    ? `Ringing ${ringingCount} people...`
    : isVideo ? "Video calling..." : "Ringing...";

  const showVideoUI = isVideo && !needsDevBuild && !error;

  return (
    <View style={[styles.container, { backgroundColor: isVideo ? "#0B141A" : "#1A1A2E", paddingTop: topPad, paddingBottom: insets.bottom + 30 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={router.back}>
        <Ionicons name="chevron-down" size={28} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
      <Text style={styles.callTypeLabel}>{isVideo ? "Videh Self-hosted Video Call" : "Videh Self-hosted Voice Call"}</Text>
      {participantCount > 2 && (
        <View style={styles.conferencePill}>
          <Ionicons name="people" size={13} color="#d9fdd3" />
          <Text style={styles.conferenceText}>
            Conference call · {acceptedCount}/{participantCount} joined
          </Text>
        </View>
      )}

      {needsDevBuild ? (
        <View style={styles.center}>
          <View style={styles.devCard}>
            <Ionicons name="call" size={48} color="#00A884" />
            <Text style={styles.devCardTitle}>Videh Calls</Text>
            <Text style={styles.devCardText}>
              Agora has been removed. Self-hosted calling uses Videh WebRTC signaling.
              For native mobile builds, add the WebRTC native module in a development build.
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
            <AgoraRemoteView uid={remoteUid ?? 0} nativeId={rest.remoteVideoId} streamUrl={remoteStreamUrl} style={styles.remoteVideo} />
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
              <AgoraLocalView nativeId={rest.localVideoId} streamUrl={localStreamUrl} style={styles.localVideoFill} />
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
  conferencePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,168,132,0.18)", borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, marginTop: 8 },
  conferenceText: { color: "#d9fdd3", fontSize: 12, fontFamily: "Inter_600SemiBold" },
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
