import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVidehCall } from "@/hooks/useVidehCall";
import { useApp } from "@/context/AppContext";
import { VidehLocalView, VidehRemoteView } from "@/components/VidehVideoView";
import {
  playCallBusyTone,
  playCallUnavailableTone,
  startOutgoingRingback,
  stopCallAlert,
} from "@/lib/callRingtone";
import { phaseLabel } from "@/lib/callState";
import { webrtcFetch } from "@/lib/webrtcApi";

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, name, type, channel, callId, incoming } = useLocalSearchParams<{ id: string; name: string; type: string; channel?: string; callId?: string; incoming?: string }>();
  const { user, refreshCallLogs } = useApp();
  const isVideo = type === "video";

  const [activeCallId, setActiveCallId] = useState(callId ?? "");
  const [activeChannel, setActiveChannel] = useState(channel ?? (incoming === "1" ? `videh_${id ?? "default"}` : ""));
  const [participantCount, setParticipantCount] = useState(1);
  const [acceptedCount, setAcceptedCount] = useState(1);
  const [ringingCount, setRingingCount] = useState(0);
  const [acceptedUserIds, setAcceptedUserIds] = useState<number[]>([]);
  const [callerId, setCallerId] = useState<number | null>(null);
  const numericUid = user?.dbId ?? 0;

  const isOutgoingCaller = incoming !== "1";
  const remotePeerIds = useMemo(() => {
    if (!user?.dbId || !activeChannel || participantCount <= 2) return [];
    if (isOutgoingCaller) {
      return acceptedUserIds.filter((peerId) => peerId !== user.dbId);
    }
    if (callerId && callerId !== user.dbId) return [callerId];
    return [];
  }, [acceptedUserIds, callerId, user?.dbId, activeChannel, isOutgoingCaller, participantCount]);

  useEffect(() => {
    if (!id || !user?.dbId || incoming === "1" || channel) return;
    let cancelled = false;
    webrtcFetch("/calls", user?.sessionToken, {
      method: "POST",
      body: JSON.stringify({ chatId: Number(id), type: isVideo ? "video" : "audio" }),
    })
      .then((res) => res.json())
      .then((data: {
        success?: boolean;
        allInviteesBusy?: boolean;
        call?: { channel?: string; callId?: string; participantCount?: number; acceptedCount?: number; ringingCount?: number };
      }) => {
        if (cancelled || !data.success || !data.call?.channel) return;
        setActiveChannel(data.call.channel);
        setActiveCallId(data.call.callId ?? "");
        setParticipantCount(data.call.participantCount ?? 1);
        setAcceptedCount(data.call.acceptedCount ?? 1);
        setRingingCount(data.call.ringingCount ?? 0);
        if (data.allInviteesBusy) {
          void (async () => {
            await stopCallAlert();
            await playCallBusyTone();
            if (data.call?.callId) {
              await webrtcFetch(`/calls/${data.call.callId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
            }
            router.back();
          })();
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id, user?.dbId, incoming, channel, isVideo]);

  const {
    joined,
    connectionPhase,
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
  } = useVidehCall(activeChannel, numericUid, isVideo, remotePeerIds, user?.sessionToken);

  const localStreamUrl = (rest as any).localStreamUrl as string | undefined;
  const remoteStreamUrl = (rest as any).remoteStreamUrl as string | undefined;

  const [duration, setDuration] = useState(0);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const endedTonePlayed = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (incoming === "1") return;
    if (joined) {
      void stopCallAlert();
      return;
    }
    void startOutgoingRingback();
    const timeout = setTimeout(() => {
      void (async () => {
        if (joined) return;
        await stopCallAlert();
        await playCallUnavailableTone();
        if (activeCallId) {
          await webrtcFetch(`/calls/${activeCallId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
        }
        router.back();
      })();
    }, 60000);
    return () => {
      clearTimeout(timeout);
      void stopCallAlert();
    };
  }, [incoming, joined, activeCallId, router, user?.sessionToken]);

  useEffect(() => {
    if (!activeCallId || !user?.dbId) return;
    const timer = setInterval(() => {
      webrtcFetch(`/calls/${activeCallId}/status?userId=${user.dbId}`, user?.sessionToken)
        .then((res) => res.json())
        .then((data: {
          success?: boolean;
          acceptedCount?: number;
          ringingCount?: number;
          busyCount?: number;
          declinedCount?: number;
          missedCount?: number;
          allInviteesBusy?: boolean;
          call?: { participantCount?: number };
          ended?: boolean;
          acceptedUserIds?: number[];
          callerId?: number;
        }) => {
          if (!data.success) return;
          setAcceptedCount(data.acceptedCount ?? 1);
          setRingingCount(data.ringingCount ?? 0);
          setParticipantCount(data.call?.participantCount ?? participantCount);
          if (Array.isArray(data.acceptedUserIds)) setAcceptedUserIds(data.acceptedUserIds);
          if (typeof data.callerId === "number") setCallerId(data.callerId);

          const remoteAccepted = (data.acceptedCount ?? 1) > 1;
          if (remoteAccepted && !joined) {
            void stopCallAlert();
            setStatusHint("Connecting…");
          }

          if (!joined && !endedTonePlayed.current) {
            if (data.allInviteesBusy || ((data.busyCount ?? 0) > 0 && (data.ringingCount ?? 0) === 0 && !remoteAccepted)) {
              endedTonePlayed.current = true;
              void (async () => {
                await stopCallAlert();
                await playCallBusyTone();
                if (activeCallId) {
                  await webrtcFetch(`/calls/${activeCallId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
                }
                void refreshCallLogs();
                router.back();
              })();
              return;
            }
            if ((data.declinedCount ?? 0) > 0 && (data.ringingCount ?? 0) === 0 && !remoteAccepted) {
              endedTonePlayed.current = true;
              void (async () => {
                await stopCallAlert();
                await playCallBusyTone();
                if (activeCallId) {
                  await webrtcFetch(`/calls/${activeCallId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
                }
                void refreshCallLogs();
                router.back();
              })();
              return;
            }
          }

          if (data.ended) {
            if (!endedTonePlayed.current && !joined) {
              endedTonePlayed.current = true;
              const unavailable = (data.missedCount ?? 0) > 0;
              void (async () => {
                await stopCallAlert();
                if (unavailable) await playCallUnavailableTone();
                void refreshCallLogs();
                router.back();
              })();
              return;
            }
            void stopCallAlert();
            void refreshCallLogs();
            router.back();
          }
        })
        .catch(() => {});
    }, 800);
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

  const pipOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const pipResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pipOffset.setOffset({ x: (pipOffset.x as any)._value, y: (pipOffset.y as any)._value });
        pipOffset.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pipOffset.x, dy: pipOffset.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => pipOffset.flattenOffset(),
    }),
  ).current;

  const endCall = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await stopCallAlert();
    await leave();
    if (activeCallId) {
      webrtcFetch(`/calls/${activeCallId}/end`, user?.sessionToken, { method: "POST" }).catch(() => {});
    }
    void refreshCallLogs();
    router.back();
  };

  useEffect(() => () => { void stopCallAlert(); }, []);

  const initials = (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (name ?? "?").charCodeAt(0) * 37 % 360;
  const avatarBg = `hsl(${hue},50%,45%)`;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const statusText = error
    ? error === "NATIVE_WEBRTC_UNAVAILABLE"
      ? "Connecting..."
      : `Error: ${error}`
    : joined
    ? remoteCount > 0
      ? formatDuration(duration)
      : connectionPhase === "reconnecting"
      ? phaseLabel("reconnecting", isVideo)
      : acceptedCount > 1
      ? "Connecting participants..."
      : "Waiting for other party..."
    : statusHint
    ? statusHint
    : incoming === "1"
    ? phaseLabel("incoming_ringing", isVideo)
    : ringingCount > 1
    ? `Ringing ${ringingCount} people...`
    : phaseLabel("outgoing_ringing", isVideo);

  const showVideoUI = isVideo;

  return (
    <View style={[styles.container, { backgroundColor: isVideo ? "#0B141A" : "#1A1A2E", paddingTop: topPad, paddingBottom: insets.bottom + 30 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => void endCall()}>
        <Ionicons name="chevron-down" size={28} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
      <Text style={styles.callTypeLabel}>{isVideo ? "Videh video call" : "Videh voice call"}</Text>
      {participantCount > 2 && (
        <View style={styles.conferencePill}>
          <Ionicons name="people" size={13} color="#d9fdd3" />
          <Text style={styles.conferenceText}>
            Conference call · {acceptedCount}/{participantCount} joined
          </Text>
        </View>
      )}

      {showVideoUI ? (
        <View style={styles.videoContainer}>
          {hasRemoteVideo || remoteStreamUrl ? (
            <VidehRemoteView nativeId={rest.remoteVideoId} streamUrl={remoteStreamUrl} style={styles.remoteVideo} />
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
            <Animated.View
              style={[styles.localVideoWrapper, { transform: pipOffset.getTranslateTransform() }]}
              {...pipResponder.panHandlers}
            >
              <VidehLocalView nativeId={rest.localVideoId} streamUrl={localStreamUrl} style={styles.localVideoFill} />
            </Animated.View>
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
});
