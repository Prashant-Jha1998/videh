import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { meteringToLevel, VOICE_WAVE_BAR_COUNT } from "@/lib/voiceWaveform";

const CANCEL_SLIDE_DX = -110;
const LOCK_SLIDE_DY = -90;
const MIN_SEND_MS = 450;

function formatVoiceClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

type Props = {
  enabled: boolean;
  colors: { primary: string; foreground: string; mutedForeground: string; isDark?: boolean };
  onSend: (uri: string, durationSec: number, waveform: number[]) => void;
  onPhaseChange?: (phase: "idle" | "holding" | "locked") => void;
  fullWidth?: boolean;
};

export function WhatsAppVoiceMic({ enabled, colors, onSend, onPhaseChange, fullWidth }: Props) {
  const recRef = useRef<Audio.Recording | null>(null);
  const lockedRef = useRef(false);
  const cancelledRef = useRef(false);
  const meteringRef = useRef<number[]>([]);
  const slideX = useRef(new Animated.Value(0)).current;

  const [phase, setPhase] = useState<"idle" | "holding" | "locked">("idle");
  const [ms, setMs] = useState(0);
  const [meter, setMeter] = useState(0.2);
  const [cancelHint, setCancelHint] = useState(false);
  const [lockHint, setLockHint] = useState(false);

  const recOptions = useMemo(
    () => ({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true as const }),
    [],
  );

  const cleanupRecording = useCallback(async () => {
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch { /* ignore */ }
    }
    lockedRef.current = false;
    cancelledRef.current = false;
    meteringRef.current = [];
    slideX.setValue(0);
    setPhase("idle");
    onPhaseChange?.("idle");
    setMs(0);
    setMeter(0.2);
    setCancelHint(false);
    setLockHint(false);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    } catch { /* ignore */ }
  }, [slideX, onPhaseChange]);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  const startRecording = useCallback(async () => {
    if (!enabled || Platform.OS === "web") {
      if (Platform.OS === "web") Alert.alert("Not supported on web", "Use the mobile app for voice notes.");
      return;
    }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Microphone permission is required for voice notes.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      meteringRef.current = [];
      const { recording } = await Audio.Recording.createAsync(
        recOptions,
        (st) => {
          if (st.isRecording && typeof st.durationMillis === "number") setMs(st.durationMillis);
          if (st.isRecording && typeof st.metering === "number") {
            const level = meteringToLevel(st.metering);
            setMeter(level);
            meteringRef.current.push(level);
          }
        },
        80,
      );
      recRef.current = recording;
      lockedRef.current = false;
      cancelledRef.current = false;
      setPhase("holding");
      onPhaseChange?.("holding");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      Alert.alert("Error", "Could not start recording.");
      await cleanupRecording();
    }
  }, [enabled, recOptions, cleanupRecording]);

  const finishSend = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) {
      await cleanupRecording();
      return;
    }
    try {
      const st = await rec.getStatusAsync();
      const durMs = typeof st.durationMillis === "number" ? st.durationMillis : ms;
      if (durMs < MIN_SEND_MS) {
        await cleanupRecording();
        return;
      }
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recRef.current = null;
      if (uri) {
        onSend(uri, Math.max(0.4, durMs / 1000), meteringRef.current);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert("Error", "Could not send voice message.");
    } finally {
      await cleanupRecording();
    }
  }, [ms, onSend, cleanupRecording]);

  const cancelRecording = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await cleanupRecording();
  }, [cleanupRecording]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => enabled && phase === "idle",
      onMoveShouldSetPanResponder: () => enabled && (phase === "holding" || phase === "locked"),
      onPanResponderGrant: () => {
        if (phase === "idle") void startRecording();
      },
      onPanResponderMove: (_, g) => {
        if (phase !== "holding" || lockedRef.current) return;
        slideX.setValue(Math.min(0, g.dx));
        const willCancel = g.dx <= CANCEL_SLIDE_DX;
        const willLock = g.dy <= LOCK_SLIDE_DY;
        setCancelHint(willCancel);
        setLockHint(willLock);
        if (willCancel) cancelledRef.current = true;
        if (willLock && !lockedRef.current) {
          lockedRef.current = true;
          setPhase("locked");
          onPhaseChange?.("locked");
          setLockHint(false);
          setCancelHint(false);
          slideX.setValue(0);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderRelease: async () => {
        if (phase === "holding" && !lockedRef.current) {
          if (cancelledRef.current) await cancelRecording();
          else await finishSend();
        }
      },
      onPanResponderTerminate: async () => {
        if (phase === "holding" && !lockedRef.current) await cancelRecording();
      },
    }),
    [enabled, phase, startRecording, finishSend, cancelRecording, slideX],
  );

  const liveBars = useMemo(() => {
    const src = meteringRef.current.length ? meteringRef.current.slice(-VOICE_WAVE_BAR_COUNT) : Array(VOICE_WAVE_BAR_COUNT).fill(meter);
    while (src.length < VOICE_WAVE_BAR_COUNT) src.unshift(0.15);
    return src.slice(-VOICE_WAVE_BAR_COUNT);
  }, [meter, ms]);

  if (phase === "locked") {
    return (
      <View style={[styles.lockedBar, fullWidth && styles.lockedBarFull, { backgroundColor: colors.isDark ? "#1a2329" : "#DCF8C6" }]}>
        <TouchableOpacity onPress={() => void cancelRecording()} style={styles.iconBtn} hitSlop={12}>
          <Ionicons name="trash-outline" size={24} color="#c62828" />
        </TouchableOpacity>
        <Text style={[styles.timer, { color: colors.foreground }]}>{formatVoiceClock(ms / 1000)}</Text>
        <View style={styles.liveWaveRow}>
          {liveBars.map((h, i) => (
            <View key={i} style={[styles.liveBar, { height: 5 + h * 18, backgroundColor: "rgba(0,168,132,0.55)" }]} />
          ))}
        </View>
        <TouchableOpacity onPress={() => void finishSend()} style={[styles.sendFab, { backgroundColor: colors.primary }]}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {(phase === "holding") && (
        <View style={styles.holdingOverlay} pointerEvents="none">
          {lockHint ? (
            <View style={styles.lockHint}>
              <Ionicons name="lock-closed" size={20} color="#fff" />
              <Text style={styles.hintTxt}>Release to lock</Text>
            </View>
          ) : null}
          <View style={styles.holdingRow}>
            <Text style={[styles.slideCancel, cancelHint && styles.slideCancelActive]}>
              {cancelHint ? "Release to cancel" : "◀ Slide to cancel"}
            </Text>
            <Text style={styles.holdingTimer}>{formatVoiceClock(ms / 1000)}</Text>
          </View>
        </View>
      )}

      <Animated.View
        style={[styles.micBtn, { backgroundColor: colors.primary, transform: [{ translateX: slideX }] }]}
        {...panResponder.panHandlers}
      >
        <Ionicons name="mic" size={18} color="#fff" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  holdingOverlay: {
    position: "absolute",
    right: 52,
    bottom: 6,
    left: -280,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 8,
  },
  holdingTimer: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#667781",
    minWidth: 44,
    textAlign: "right",
  },
  slideCancel: {
    flex: 1,
    textAlign: "right",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#8696A0",
  },
  slideCancelActive: { color: "#c62828" },
  lockHint: {
    position: "absolute",
    top: -72,
    right: 0,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  hintTxt: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  lockedBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginHorizontal: 6,
    marginBottom: 4,
    borderRadius: 12,
    gap: 8,
  },
  lockedBarFull: { flex: 1, marginHorizontal: 0, marginBottom: 0 },
  iconBtn: { padding: 6 },
  timer: { fontSize: 15, fontFamily: "Inter_600SemiBold", minWidth: 44 },
  liveWaveRow: { flex: 1, flexDirection: "row", alignItems: "flex-end", height: 34, gap: 2 },
  liveBar: { width: 2.5, borderRadius: 1, alignSelf: "flex-end" },
  sendFab: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
