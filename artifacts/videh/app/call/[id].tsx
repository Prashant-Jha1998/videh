import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  PanResponder,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VidehLocalView, VidehRemoteView } from "@/components/VidehVideoView";
import { AddCallParticipantModal } from "@/components/AddCallParticipantModal";
import { GroupCallGrid, type RemoteCallPeer } from "@/components/GroupCallGrid";
import { useCallSession } from "@/context/CallSessionContext";
import { useApp } from "@/context/AppContext";
import type { InCallAudioRoute } from "@/lib/inCallAudio";
import { phaseLabel } from "@/lib/callState";
import { createCallLink } from "@/lib/callLinks";
import { isScreenShareSupported } from "@/lib/screenShare";

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    name: string;
    type: string;
    channel?: string;
    callId?: string;
    incoming?: string;
    ringing?: string;
  }>();

  const {
    session,
    initFromRoute,
    joined,
    mediaReady,
    callAnswered,
    error,
    muted,
    cameraOff,
    speakerOn,
    remoteCount,
    hasRemoteVideo,
    remoteStreamUrl,
    statusText,
    localStreamUrl,
    localVideoId,
    remoteVideoId,
    participantCount,
    acceptedCount,
    ringingCount,
    minimizeCall,
    endCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    addParticipants,
    inviteeUserIds,
    remotePeers,
    switchCallMediaType,
    setInCallAudioRoute,
    shareScreen,
    stopScreenShare,
  } = useCallSession();
  const { chats, user } = useApp();

  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [addingPeople, setAddingPeople] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);

  useEffect(() => {
    initFromRoute(params);
  }, [params.id, params.callId, params.channel, params.incoming, params.ringing]);

  const isVideo = session?.isVideo ?? params.type === "video";
  const name = session?.contactName ?? params.name ?? "Contact";
  const ringing = Boolean(session?.ringing);
  const incoming = session?.isIncoming ?? params.incoming === "1";

  const pulse = useRef(new Animated.Value(1)).current;
  const pipOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  useEffect(() => {
    if (ringing) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [ringing, pulse, joined]);

  const pipResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => isVideo && joined,
      onPanResponderGrant: () => {
        pipOffset.setOffset({ x: (pipOffset.x as any)._value, y: (pipOffset.y as any)._value });
        pipOffset.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pipOffset.x, dy: pipOffset.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => pipOffset.flattenOffset(),
    }),
  ).current;

  const initials = (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (name ?? "?").charCodeAt(0) * 37 % 360;
  const avatarBg = `hsl(${hue},50%,45%)`;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const gridPeers: RemoteCallPeer[] = useMemo(() => {
    if (remotePeers.length > 0) {
      return remotePeers.map((p) => ({
        peerId: p.peerId,
        streamUrl: p.streamUrl,
        hasVideo: p.hasVideo,
        name: chats.find((c) => c.otherUserId === p.peerId)?.name ?? name,
      }));
    }
    if (joined && remoteStreamUrl) {
      return [{ peerId: 0, streamUrl: remoteStreamUrl, hasVideo: hasRemoteVideo, name }];
    }
    return [];
  }, [remotePeers, joined, remoteStreamUrl, hasRemoteVideo, chats, name]);

  const pickAudioRoute = () => {
    const routes: { label: string; route: InCallAudioRoute }[] = [
      { label: "Phone", route: "EARPIECE" },
      { label: "Speaker", route: "SPEAKER_PHONE" },
      { label: "Bluetooth", route: "BLUETOOTH" },
    ];
    Alert.alert("Audio output", "", [
      ...routes.map((r) => ({
        text: r.label,
        onPress: () => { void setInCallAudioRoute(r.route); },
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const displayStatus = error
    ? error === "NATIVE_WEBRTC_UNAVAILABLE"
      ? "Connecting..."
      : `Error: ${error}`
    : callAnswered || mediaReady
    ? statusText
    : statusText
    || (incoming && !joined
      ? phaseLabel("incoming_ringing", isVideo)
      : ringingCount > 1
      ? `Ringing ${ringingCount} people...`
      : phaseLabel("outgoing_ringing", isVideo));

  const isOneToOne = participantCount <= 2;

  if (ringing && incoming) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: isVideo ? "#0B141A" : "#1A1A2E", paddingTop: topPad, paddingBottom: insets.bottom + 30 }]}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={minimizeCall}>
          <Ionicons name="chevron-down" size={28} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
        {joined && !isOneToOne ? (
          <TouchableOpacity
            style={styles.addPersonBtn}
            onPress={() => setAddPeopleOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="person-add" size={22} color="#fff" />
            <Text style={styles.addPersonLbl}>Add</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.callTypeLabel}>{isVideo ? "Videh video call" : "Videh voice call"}</Text>
      {!isOneToOne && participantCount > 2 && (
        <View style={styles.conferencePill}>
          <Ionicons name="people" size={13} color="#d9fdd3" />
          <Text style={styles.conferenceText}>
            Conference call · {acceptedCount}/{participantCount} joined
          </Text>
        </View>
      )}

      {isVideo ? (
        <View style={styles.videoContainer}>
          {!isOneToOne && participantCount > 2 && gridPeers.length > 1 ? (
            <GroupCallGrid peers={gridPeers} placeholderColor={avatarBg} />
          ) : remoteStreamUrl ? (
            <VidehRemoteView nativeId={remoteVideoId} streamUrl={remoteStreamUrl} style={styles.remoteVideo} />
          ) : hasRemoteVideo && joined ? (
            <View style={[styles.remoteVideo, styles.videoPlaceholder]}>
              <Text style={styles.callStatus}>Connecting video…</Text>
            </View>
          ) : (
            <View style={[styles.remoteVideo, styles.videoPlaceholder]}>
              <Animated.View style={[styles.avatarRing, { borderColor: avatarBg, transform: [{ scale: !joined ? pulse : 1 }] }]}>
                <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              </Animated.View>
              <Text style={styles.callerName}>{name}</Text>
              <Text style={styles.callStatus}>{displayStatus}</Text>
            </View>
          )}
          {joined && !cameraOff && (
            <Animated.View
              style={[styles.localVideoWrapper, { transform: pipOffset.getTranslateTransform() }]}
              {...pipResponder.panHandlers}
            >
              <VidehLocalView nativeId={localVideoId} streamUrl={localStreamUrl} style={styles.localVideoFill} />
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
          <Text style={styles.callStatus}>{displayStatus}</Text>
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
            label="Audio"
            onPress={() => {
              if (Platform.OS === "web") {
                toggleSpeaker();
              } else {
                pickAudioRoute();
              }
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            active={speakerOn}
          />
          {joined ? (
            <ControlBtn
              icon={isVideo ? "call" : "videocam"}
              label={isVideo ? "Voice only" : "Video"}
              onPress={() => {
                void switchCallMediaType(!isVideo);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              active={false}
            />
          ) : null}
          {isVideo && (
            <ControlBtn
              icon={cameraOff ? "videocam-off" : "videocam"}
              label="Camera"
              onPress={() => { toggleCamera(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              active={cameraOff}
            />
          )}
          <ControlBtn
            icon="chatbubble-outline"
            label="Message"
            onPress={minimizeCall}
            active={false}
          />
          {joined ? (
            <ControlBtn
              icon="link-outline"
              label="Link"
              onPress={() => {
                void (async () => {
                  const chatId = Number(session?.chatId ?? params.id);
                  const link = await createCallLink(user?.sessionToken, {
                    chatId: Number.isFinite(chatId) ? chatId : undefined,
                    type: isVideo ? "video" : "audio",
                    title: name,
                  });
                  if (!link) {
                    Alert.alert("Call link", "Could not create link. Try again.");
                    return;
                  }
                  await Share.share({ message: link.deepLink });
                })();
              }}
              active={false}
            />
          ) : null}
          {joined && isVideo ? (
            <ControlBtn
              icon="desktop-outline"
              label={screenSharing ? "Stop share" : "Share"}
              onPress={() => {
                void (async () => {
                  if (screenSharing) {
                    await stopScreenShare();
                    setScreenSharing(false);
                    return;
                  }
                  if (!isScreenShareSupported()) {
                    Alert.alert(
                      "Screen share",
                      Platform.OS === "web"
                        ? "Your browser blocked screen sharing."
                        : "Screen sharing is available on Videh Web for now.",
                    );
                    return;
                  }
                  const ok = await shareScreen();
                  if (ok) setScreenSharing(true);
                })();
              }}
              active={screenSharing}
            />
          ) : null}
        </View>

        <TouchableOpacity style={styles.endBtn} onPress={() => void endCall()} activeOpacity={0.85}>
          <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
        </TouchableOpacity>
      </View>

      {!isOneToOne ? (
      <AddCallParticipantModal
        visible={addPeopleOpen}
        onClose={() => setAddPeopleOpen(false)}
        busy={addingPeople}
        excludeUserIds={inviteeUserIds}
        onAdd={async (ids) => {
          setAddingPeople(true);
          try {
            const { added, busy } = await addParticipants(ids);
            const parts: string[] = [];
            if (added > 0) parts.push(`${added} invited`);
            if (busy > 0) parts.push(`${busy} busy`);
            if (parts.length > 0) Alert.alert("Add to call", parts.join(", ") + ".");
          } finally {
            setAddingPeople(false);
          }
        }}
      />
      ) : null}
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
  incomingRoot: { backgroundColor: "#0B141A", justifyContent: "flex-start" },
  incomingHeader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 32,
    minHeight: 0,
  },
  incomingSubtitle: {
    color: "#8696A0",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    textAlign: "center",
  },
  incomingMiddle: { width: "100%", paddingHorizontal: 28, marginBottom: 20 },
  incomingFooter: { width: "100%", paddingHorizontal: 40, alignItems: "center", marginTop: "auto" },
  incomingActions: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 16,
    maxWidth: 280,
    alignSelf: "center",
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
  quickRow: { flexDirection: "row", gap: 10, width: "100%" },
  quickChip: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  quickTxt: { color: "#AEBAC1", fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingRight: 8,
  },
  backBtn: { padding: 16 },
  addPersonBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  addPersonLbl: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
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
