import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VidehLocalView, VidehRemoteView } from "@/components/VidehVideoView";
import { CallOutcomeScreen } from "@/components/CallOutcomeScreen";
import { AddCallParticipantModal } from "@/components/AddCallParticipantModal";
import { GroupCallGrid, type RemoteCallPeer } from "@/components/GroupCallGrid";
import { useCallSession } from "@/context/CallSessionContext";
import { useApp } from "@/context/AppContext";
import type { InCallAudioRoute } from "@/lib/inCallAudio";
import { phaseLabel } from "@/lib/callState";
import { useOutgoingCallCameraPreview } from "@/lib/callLocalPreview";

const CALL_CONTROLS_HIDE_MS = 6000;

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
    callerId?: string;
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
    participantCount,
    acceptedCount,
    ringingCount,
    minimizeCall,
    endCall,
    toggleMute,
    toggleCamera,
    flipCamera,
    isFrontCamera,
    localVideoRevision,
    toggleSpeaker,
    addParticipants,
    inviteeUserIds,
    remotePeers,
    setInCallAudioRoute,
    callOutcome,
    outcomeSnapshot,
    dismissCallOutcome,
    redialFromOutcome,
  } = useCallSession();
  const { chats } = useApp();

  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [addingPeople, setAddingPeople] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [videoFocus, setVideoFocus] = useState<"remote" | "local">("remote");
  const [pipMountReady, setPipMountReady] = useState(true);
  const controlsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }, []);

  const scheduleHideControls = useCallback(() => {
    clearControlsHideTimer();
    controlsHideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CALL_CONTROLS_HIDE_MS);
  }, [clearControlsHideTimer]);

  const showCallControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  // FIX: Stable callback reference for initFromRoute so the effect below does
  // not re-run on every render — only when actual route params change.
  const initFromRouteRef = useRef(initFromRoute);
  initFromRouteRef.current = initFromRoute;

  useEffect(() => {
    initFromRouteRef.current(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, params.callId, params.channel, params.incoming, params.ringing, params.callerId]);

  const isVideo = session?.isVideo ?? params.type === "video";
  const name = session?.contactName ?? params.name ?? "Contact";
  const ringing = Boolean(session?.ringing);
  const incoming = session?.isIncoming ?? params.incoming === "1";

  const pulse = useRef(new Animated.Value(1)).current;
  const pipOffset = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  useEffect(() => {
    if (joined) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [joined, pulse]);

  const pipResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        isVideo && joined && (Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8),
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

  const pickAudioRoute = useCallback(() => {
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
  }, [setInCallAudioRoute]);

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
  const contactAvatar = useMemo(() => {
    const chatId = session?.chatId ?? params.id;
    const chat = chats.find((c) => String(c.id) === String(chatId));
    return chat?.avatar ?? null;
  }, [chats, session?.chatId, params.id]);

  if (callOutcome && outcomeSnapshot) {
    return (
      <CallOutcomeScreen
        contactName={outcomeSnapshot.contactName}
        avatarUrl={contactAvatar}
        outcome={callOutcome}
        onCancel={dismissCallOutcome}
        onCallAgain={redialFromOutcome}
        onVoiceMessage={() => {
          dismissCallOutcome();
          router.replace({ pathname: "/chat/[id]", params: { id: outcomeSnapshot.chatId } });
        }}
      />
    );
  }

  // Incoming ringing is handled by IncomingCallOverlay in _layout — don't render here.
  if (ringing && incoming) {
    return null;
  }

  const outgoingRinging = !incoming && !joined && !callAnswered && !error;
  const outgoingVideoRinging = outgoingRinging && isOneToOne && isVideo;
  const ringPreviewUrl = useOutgoingCallCameraPreview(outgoingVideoRinging && !localStreamUrl);
  const effectiveLocalUrl = localStreamUrl || ringPreviewUrl;
  const canAutoHideTopBar = isVideo && (joined || callAnswered || mediaReady) && !outgoingVideoRinging;
  const showBottomControls = !isVideo || joined || outgoingVideoRinging || callAnswered || mediaReady;
  const localRenderKey = `local-${localVideoRevision}-${videoFocus}`;
  const remoteRenderKey = `remote-${videoFocus}-${remoteStreamUrl ?? "none"}`;

  useEffect(() => {
    if (!canAutoHideTopBar) {
      setControlsVisible(true);
      clearControlsHideTimer();
      return;
    }
    scheduleHideControls();
    return clearControlsHideTimer;
  }, [canAutoHideTopBar, clearControlsHideTimer, scheduleHideControls]);

  useEffect(() => () => clearControlsHideTimer(), [clearControlsHideTimer]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && isVideo && joined) {
        setControlsVisible(true);
        scheduleHideControls();
      }
    });
    return () => sub.remove();
  }, [isVideo, joined, scheduleHideControls]);

  // ── WhatsApp-style outgoing audio call screen ──────────────────────────────
  if (outgoingRinging && isOneToOne && !isVideo) {
    return (
      <View style={[styles.waRoot, { paddingTop: topPad, paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.waTop}>
          <Text style={styles.waName}>{name}</Text>
          <Text style={styles.waStatus}>{displayStatus}</Text>
        </View>
        <View style={styles.waCenter}>
          {contactAvatar ? (
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <Image source={{ uri: contactAvatar }} style={styles.waAvatarImg} contentFit="cover" />
            </Animated.View>
          ) : (
            <Animated.View style={[styles.avatarRing, { borderColor: avatarBg, transform: [{ scale: pulse }] }]}>
              <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            </Animated.View>
          )}
        </View>
        <TouchableOpacity style={styles.endBtn} onPress={() => void endCall()} activeOpacity={0.85}>
          <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
        </TouchableOpacity>
      </View>
    );
  }

  // ── In-call / video ringing / connected screen ─────────────────────────────
  const pipBottom = controlsVisible ? insets.bottom + 118 : insets.bottom + 28;
  const showLocalPip =
    isVideo
    && !cameraOff
    && !!effectiveLocalUrl
    && joined
    && isOneToOne
    && videoFocus === "remote";
  const showRemotePip =
    isVideo
    && videoFocus === "local"
    && !!remoteStreamUrl
    && joined
    && isOneToOne;

  const swapVideoFocus = () => {
    if (!joined || !remoteStreamUrl || !effectiveLocalUrl) return;
    setPipMountReady(false);
    setVideoFocus((f) => (f === "remote" ? "local" : "remote"));
    showCallControls();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    requestAnimationFrame(() => {
      setTimeout(() => setPipMountReady(true), 50);
    });
  };

  const renderRemoteMain = () => {
    if (!isOneToOne && participantCount > 2 && gridPeers.length > 1) {
      return <GroupCallGrid peers={gridPeers} placeholderColor={avatarBg} />;
    }
    if (remoteStreamUrl) {
      return (
        <VidehRemoteView
          streamUrl={remoteStreamUrl}
          style={styles.remoteVideo}
          renderKey={`main-${remoteRenderKey}`}
        />
      );
    }
    if (hasRemoteVideo && joined) {
      return (
        <View style={[styles.remoteVideo, styles.videoPlaceholder]}>
          <Text style={styles.callStatus}>Connecting video…</Text>
        </View>
      );
    }
    return (
      <View style={[styles.remoteVideo, styles.videoPlaceholder]}>
        {outgoingVideoRinging ? null : (
          <>
            <Animated.View style={[styles.avatarRing, { borderColor: avatarBg, transform: [{ scale: !joined ? pulse : 1 }] }]}>
              <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            </Animated.View>
            <Text style={styles.callerName}>{name}</Text>
          </>
        )}
        <Text style={styles.callStatus}>{displayStatus}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isVideo ? "#0B141A" : "#1A1A2E", paddingTop: isVideo ? 0 : topPad, paddingBottom: isVideo ? 0 : insets.bottom + 30 }]}>
      {isVideo ? (
        <View style={styles.videoStage}>
          <Pressable style={styles.videoContainer} onPress={showCallControls}>
            {outgoingVideoRinging || (videoFocus === "local" && effectiveLocalUrl && joined) ? (
              <VidehLocalView
                streamUrl={effectiveLocalUrl}
                mirror={isFrontCamera}
                style={styles.remoteVideo}
                renderKey={`main-${localRenderKey}`}
              />
            ) : (
              renderRemoteMain()
            )}
          </Pressable>

          {controlsVisible ? (
            <View style={[styles.videoOverlayTop, { paddingTop: topPad + 8 }]}>
              <TouchableOpacity style={styles.backBtn} onPress={minimizeCall}>
                <Ionicons name="chevron-down" size={28} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
              <View style={styles.videoOverlayCenter}>
                <Text style={styles.waNameSmall} numberOfLines={1}>{name}</Text>
                <Text style={styles.waStatusSmall}>{displayStatus}</Text>
              </View>
              <View style={styles.videoOverlayRight}>
                {joined && !isOneToOne ? (
                  <TouchableOpacity style={styles.roundToolBtn} onPress={() => setAddPeopleOpen(true)}>
                    <Ionicons name="person-add" size={22} color="#fff" />
                  </TouchableOpacity>
                ) : null}
                {(joined || outgoingVideoRinging) && effectiveLocalUrl ? (
                  <TouchableOpacity
                    style={styles.roundToolBtn}
                    onPress={() => { void flipCamera(); showCallControls(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  >
                    <Ionicons name="camera-reverse" size={22} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          {showLocalPip && pipMountReady ? (
            <Animated.View
              style={[
                styles.localVideoWrapper,
                { bottom: pipBottom, top: undefined, transform: pipOffset.getTranslateTransform() },
              ]}
              {...pipResponder.panHandlers}
            >
              <TouchableOpacity activeOpacity={0.92} onPress={swapVideoFocus} style={styles.pipTap}>
                <VidehLocalView
                  streamUrl={effectiveLocalUrl}
                  mirror={isFrontCamera}
                  pip
                  style={styles.localVideoFill}
                  renderKey={`pip-${localRenderKey}`}
                />
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {showRemotePip && pipMountReady ? (
            <Animated.View
              style={[
                styles.localVideoWrapper,
                { bottom: pipBottom, top: undefined, transform: pipOffset.getTranslateTransform() },
              ]}
              {...pipResponder.panHandlers}
            >
              <TouchableOpacity activeOpacity={0.92} onPress={swapVideoFocus} style={styles.pipTap}>
                <VidehRemoteView
                  streamUrl={remoteStreamUrl}
                  pip
                  style={styles.localVideoFill}
                  renderKey={`pip-${remoteRenderKey}`}
                />
              </TouchableOpacity>
            </Animated.View>
          ) : null}
        </View>
      ) : (
        <>
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

        <View style={styles.center}>
          {contactAvatar ? (
            <Animated.View style={{ transform: [{ scale: !joined ? pulse : 1 }], marginBottom: 24 }}>
              <Image source={{ uri: contactAvatar }} style={styles.avatarPhoto} contentFit="cover" />
            </Animated.View>
          ) : (
            <Animated.View style={[styles.avatarRing, { borderColor: avatarBg, transform: [{ scale: !joined ? pulse : 1 }] }]}>
              <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            </Animated.View>
          )}
          <Text style={styles.callerName}>{name}</Text>
          <Text style={styles.callStatus}>{displayStatus}</Text>
          {joined && (
            <View style={styles.encryptBadge}>
              <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={styles.encryptText}>End-to-end encrypted</Text>
            </View>
          )}
        </View>
        </>
      )}

      {showBottomControls ? (
      <View style={[styles.controls, isVideo && { position: "absolute", left: 0, right: 0, bottom: insets.bottom + 16 }]}>
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
          {isVideo ? (
            <ControlBtn
              icon={cameraOff ? "videocam-off" : "videocam"}
              label="Camera"
              onPress={() => { toggleCamera(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              active={cameraOff}
            />
          ) : null}
          {joined && !isOneToOne ? (
            <ControlBtn
              icon="person-add"
              label="Add"
              onPress={() => setAddPeopleOpen(true)}
              active={false}
            />
          ) : null}
        </View>

        <TouchableOpacity style={styles.endBtn} onPress={() => void endCall()} activeOpacity={0.85}>
          <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
        </TouchableOpacity>
      </View>
      ) : null}

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
  // ── WhatsApp outgoing style ──
  waRoot: {
    flex: 1,
    backgroundColor: "#0B141A",
    alignItems: "center",
  },
  waTop: {
    alignItems: "center",
    paddingHorizontal: 28,
    marginTop: 12,
  },
  waName: {
    color: "#F0F2F5",
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  waStatus: {
    color: "#8696A0",
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    textAlign: "center",
  },
  waCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  waAvatarImg: {
    width: 168,
    height: 168,
    borderRadius: 84,
  },
  // Outgoing video ringing — mute/speaker row above end button
  outgoingVideoControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 40,
    paddingBottom: 8,
    gap: 16,
  },
  // ── In-call screen ──
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
  conferencePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,168,132,0.18)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  conferenceText: { color: "#d9fdd3", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  videoStage: { flex: 1, width: "100%", position: "relative" },
  videoContainer: { flex: 1, width: "100%", position: "relative" },
  videoOverlayTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 4,
    zIndex: 4,
  },
  videoOverlayCenter: { flex: 1, alignItems: "center", paddingTop: 4 },
  videoOverlayRight: { flexDirection: "row", gap: 8, paddingTop: 8, paddingRight: 8 },
  roundToolBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  waNameSmall: { color: "#F0F2F5", fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  waStatusSmall: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  pipTap: { flex: 1 },
  remoteVideo: { flex: 1, width: "100%", backgroundColor: "#111" },
  videoPlaceholder: { alignItems: "center", justifyContent: "center" },
  localVideoWrapper: {
    position: "absolute",
    right: 12,
    width: 108,
    height: 148,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    zIndex: 5,
  },
  localVideoFill: { flex: 1, backgroundColor: "#222" },
  avatarRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  avatar: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 44, fontFamily: "Inter_700Bold" },
  // Round photo avatar for voice in-call (when contactAvatar is available)
  avatarPhoto: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  callerName: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold", marginBottom: 8 },
  callStatus: { color: "rgba(255,255,255,0.7)", fontSize: 16, fontFamily: "Inter_400Regular" },
  encryptBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  encryptText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "Inter_400Regular" },
  controls: { width: "100%", alignItems: "center", paddingHorizontal: 20, gap: 24 },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    width: "100%",
    gap: 28,
    paddingHorizontal: 8,
  },
  ctrlBtn: { alignItems: "center", gap: 8, minWidth: 68 },
  ctrlIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlActive: { backgroundColor: "rgba(255,255,255,0.9)" },
  ctrlLabel: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_400Regular" },
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
});