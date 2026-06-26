import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebVoiceRecorder } from "@/lib/web/webVoiceRecorder";
import { VOICE_WAVE_BAR_COUNT } from "@/lib/voiceWaveform";

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

/** Videh Web–style: tap mic to record, tap send or trash to finish. */
export function VidehVoiceMic({ enabled, colors, onSend, onPhaseChange, fullWidth }: Props) {
  const recorderRef = useRef<WebVoiceRecorder | null>(null);
  const startedAtRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setPhase = useCallback(
    (phase: "idle" | "holding" | "locked") => {
      onPhaseChange?.(phase);
    },
    [onPhaseChange],
  );

  const stopTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (!enabled || recording) return;
    try {
      const rec = new WebVoiceRecorder();
      await rec.start();
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setRecording(true);
      setSeconds(0);
      setPhase("locked");
      stopTick();
      tickRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 400);
    } catch (e) {
      Alert.alert(
        "Microphone",
        e instanceof Error ? e.message : "Allow microphone access to record voice messages.",
      );
    }
  }, [enabled, recording, setPhase, stopTick]);

  const finish = useCallback(
    async (cancelled: boolean) => {
      const rec = recorderRef.current;
      recorderRef.current = null;
      stopTick();
      setRecording(false);
      setPhase("idle");
      if (!rec) return;
      const result = await rec.stop(cancelled);
      if (!cancelled && result) {
        const elapsed = Date.now() - startedAtRef.current;
        if (elapsed < MIN_SEND_MS) return;
        onSend(result.uri, result.durationSec, result.waveform);
      }
    },
    [onSend, setPhase, stopTick],
  );

  const liveBars = useMemo(
    () => Array.from({ length: VOICE_WAVE_BAR_COUNT }, () => 0.2 + Math.random() * 0.5),
    [seconds],
  );

  if (recording) {
    return (
      <View style={[styles.lockedBar, fullWidth && styles.lockedBarFull, { backgroundColor: colors.isDark ? "#1a2329" : "#DCF8C6" }]}>
        <TouchableOpacity onPress={() => void finish(true)} style={styles.iconBtn} hitSlop={12}>
          <Ionicons name="trash-outline" size={24} color="#c62828" />
        </TouchableOpacity>
        <View style={styles.recRow}>
          <View style={styles.recDot} />
          <Text style={[styles.timer, { color: colors.foreground }]}>{formatVoiceClock(seconds)}</Text>
        </View>
        <View style={styles.liveWaveRow}>
          {liveBars.map((h, i) => (
            <View key={i} style={[styles.liveBar, { height: 5 + h * 18, backgroundColor: "rgba(0,168,132,0.55)" }]} />
          ))}
        </View>
        <TouchableOpacity onPress={() => void finish(false)} style={[styles.sendFab, { backgroundColor: colors.primary }]}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.micBtn, { backgroundColor: colors.primary, opacity: enabled ? 1 : 0.45 }]}
      onPress={() => void startRecording()}
      disabled={!enabled}
      accessibilityLabel="Record voice message"
    >
      <Ionicons name="mic" size={18} color="#fff" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
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
  recRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#F0353B" },
  timer: { fontSize: 15, fontFamily: "Inter_600SemiBold", minWidth: 44 },
  liveWaveRow: { flex: 1, flexDirection: "row", alignItems: "flex-end", height: 34, gap: 2 },
  liveBar: { width: 2.5, borderRadius: 1, alignSelf: "flex-end" },
  sendFab: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
