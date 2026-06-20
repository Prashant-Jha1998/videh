import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant } from "@/context/AssistantContext";
import { useApp } from "@/context/AppContext";
import {
  deleteAssistantVoice,
  enrollAssistantVoice,
  patchAssistantPrefs,
} from "@/lib/assistantApi";
import { getAndroidSpeechEngineLabel } from "@/lib/androidSpeechService";
import { setAssistantVoiceEnrollmentActive } from "@/lib/assistantPause";
import { destroySpeech, isSpeechRecognitionAvailable, stopListening } from "@/lib/assistantSpeech";
import {
  deleteEnrollmentFile,
  playEnrollmentSample,
  recordVoiceSample,
  releaseVoiceEnrollmentRecording,
  type VoiceEnrollmentSample,
} from "@/lib/voiceEnrollment";
import { useColors } from "@/hooks/useColors";
import { HEY_VIDeh_ENABLED } from "@/lib/heyVidehFeature";
import { HeyVidehComingSoonScreen } from "@/components/HeyVidehComingSoon";

const ENROLLMENT_SAMPLES = 3;

type EnrollPhase = "idle" | "recording" | "review";

export default function AssistantSettingsScreen() {
  if (!HEY_VIDeh_ENABLED) {
    return <HeyVidehComingSoonScreen />;
  }
  return <AssistantSettingsContent />;
}

function AssistantSettingsContent() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const { prefs, refreshPrefs, setEnabled, activateManually, lastError, phase } = useAssistant();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [enrollPhase, setEnrollPhase] = useState<EnrollPhase>("idle");
  const [sampleIndex, setSampleIndex] = useState(0);
  const [samples, setSamples] = useState<VoiceEnrollmentSample[]>([]);
  const [meter, setMeter] = useState(0.2);
  const [listenLocked, setListenLocked] = useState(true);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [capturingSample, setCapturingSample] = useState(false);

  useEffect(() => {
    if (prefs) setListenLocked(prefs.listenWhenLocked);
  }, [prefs]);

  useEffect(() => {
    const enrolling = enrollPhase !== "idle";
    setAssistantVoiceEnrollmentActive(enrolling);
    if (enrolling) {
      void stopListening();
      void destroySpeech();
    }
    return () => {
      setAssistantVoiceEnrollmentActive(false);
      void releaseVoiceEnrollmentRecording();
    };
  }, [enrollPhase]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    void refreshPrefs();
    void import("@/lib/assistantSpeech").then((m) => {
      if (!m.isSpeechRecognitionAvailable()) return;
      void import("expo-speech-recognition").then(({ ExpoSpeechRecognitionModule }) => {
        void ExpoSpeechRecognitionModule.requestPermissionsAsync();
      }).catch(() => {});
    });
  }, [refreshPrefs]);

  const resetEnrollment = useCallback(async () => {
    for (const s of samples) {
      await deleteEnrollmentFile(s.uri);
    }
    setSamples([]);
    setSampleIndex(0);
    setEnrollPhase("idle");
    setPlayingIdx(null);
  }, [samples]);

  const startEnrollment = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Mobile app required", "Hey Videh voice setup works on the Android/iOS app.");
      return;
    }
    await resetEnrollment();
    setEnrollPhase("recording");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [resetEnrollment]);

  const recordNextSample = useCallback(async () => {
    if (capturingSample) return;
    setCapturingSample(true);
    try {
      await stopListening();
      await destroySpeech();
      await releaseVoiceEnrollmentRecording();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const sample = await recordVoiceSample(2600, setMeter);
      const next = [...samples, sample];
      setSamples(next);
      setMeter(0.2);
      if (next.length >= ENROLLMENT_SAMPLES) {
        setEnrollPhase("review");
      } else {
        setSampleIndex(next.length);
      }
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : "Recording failed.";
      const message = /only one recording object/i.test(raw)
        ? "Microphone is in use (Hey Videh or another chat recording). Wait a moment and tap Record again."
        : raw;
      Alert.alert("Microphone error", message);
      setEnrollPhase("idle");
    } finally {
      setCapturingSample(false);
    }
  }, [samples]);

  const playSample = useCallback(async (idx: number) => {
    const uri = samples[idx]?.uri;
    if (!uri) return;
    setPlayingIdx(idx);
    try {
      await playEnrollmentSample(uri);
    } finally {
      setPlayingIdx(null);
    }
  }, [samples]);

  const confirmEnrollment = useCallback(async () => {
    if (samples.length < ENROLLMENT_SAMPLES) return;
    setSaving(true);
    try {
      const { ok, message } = await enrollAssistantVoice(
        user?.sessionToken,
        samples.map((s) => s.fingerprint),
      );
      if (ok) {
        await refreshPrefs();
        if (!prefs?.enabled) {
          await setEnabled(true);
        }
        setEnrollPhase("idle");
        Alert.alert(
          "Voice saved",
          "Say \"Hey Videh\" when the app is open (or with Listen when locked on). Keep the phone unlocked first time to confirm it works.",
        );
      } else {
        Alert.alert("Error", message ?? "Could not save voice profile. Record again in a quiet place.");
      }
    } finally {
      setSaving(false);
    }
  }, [samples, user?.sessionToken, refreshPrefs, prefs?.enabled, setEnabled]);

  const deleteVoiceProfile = useCallback(async () => {
    Alert.alert(
      "Delete voice profile?",
      "Hey Videh will stop using your voice until you set it up again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await resetEnrollment();
              const ok = await deleteAssistantVoice(user?.sessionToken);
              if (ok) {
                await refreshPrefs();
                Alert.alert("Deleted", "Set up your voice again when ready.");
              } else {
                Alert.alert("Error", "Could not delete voice profile.");
              }
            })();
          },
        },
      ],
    );
  }, [resetEnrollment, user?.sessionToken, refreshPrefs]);

  const toggleListenLocked = async (value: boolean) => {
    setListenLocked(value);
    if (user?.sessionToken) {
      await patchAssistantPrefs(user.sessionToken, { listenWhenLocked: value });
      await refreshPrefs();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, backgroundColor: colors.headerBg }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hey Videh</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.hero, { backgroundColor: colors.card }]}>
          <View style={styles.heroIcon}>
            <Ionicons name="mic-circle" size={56} color="#00A884" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>Videh AI voice assistant</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            Boliye &quot;Hey Videh&quot; — phir apni bhasha mein kuch bhi: kisi bhi contact ya group ko call/message, aaj kis ka message aaya, missed calls, group activity, ya app/settings ke baare mein sawal. Har user ki chat list alag hoti hai.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>STATUS</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Row label="Voice enrolled" value={prefs?.voiceEnrolled ? "Yes" : "No"} colors={colors} />
          <Row
            label="Speech recognition"
            value={isSpeechRecognitionAvailable() ? "Ready" : "Needs mobile app"}
            colors={colors}
          />
          {Platform.OS === "android" && isSpeechRecognitionAvailable() ? (
            <Row
              label="Speech engine"
              value={getAndroidSpeechEngineLabel() ?? "System default"}
              colors={colors}
            />
          ) : null}
          <Row label="Assistant" value={prefs?.enabled ? "On" : "Off"} colors={colors} />
          <Row label="Listening" value={phase === "idle" && prefs?.enabled ? "Waiting for Hey Videh" : phase} colors={colors} />
          {lastError ? (
            <Text style={[styles.hint, { color: "#c62828", marginTop: 8 }]}>{lastError}</Text>
          ) : null}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CONTROLS</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.switchRow}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Hey Videh enabled</Text>
            <Switch
              value={Boolean(prefs?.enabled)}
              onValueChange={(v) => void setEnabled(v)}
              trackColor={{ true: "#00A884" }}
            />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.switchRow}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Listen when phone locked</Text>
            <Switch
              value={listenLocked}
              onValueChange={(v) => void toggleListenLocked(v)}
              trackColor={{ true: "#00A884" }}
            />
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            App open hone par &quot;Hey Videh&quot; sunne ke liye mic chahiye. Lock screen par Android mic band kar sakta hai — pehle unlock karke try karein. Phone ke Settings → Languages → Voice input mein speech-to-text engine select hona chahiye (alag se Google app install karne ki zaroorat nahi).
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>VOICE SETUP</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {enrollPhase === "idle" && (
            <>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => void startEnrollment()}>
                <Ionicons name="recording" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {prefs?.voiceEnrolled ? "Set up voice again" : "Set up voice"}
                </Text>
              </TouchableOpacity>
              {prefs?.voiceEnrolled ? (
                <TouchableOpacity style={styles.dangerBtn} onPress={() => void deleteVoiceProfile()}>
                  <Ionicons name="trash-outline" size={18} color="#c62828" />
                  <Text style={styles.dangerBtnText}>Delete voice profile</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}

          {enrollPhase === "recording" && (
            <View style={styles.enrollBox}>
              <Text style={[styles.enrollStep, { color: colors.foreground }]}>
                Sample {sampleIndex + 1} of {ENROLLMENT_SAMPLES}
              </Text>
              <Text style={[styles.enrollHint, { color: colors.mutedForeground }]}>
                Tap Record and say clearly: &quot;Hey Videh&quot;
              </Text>
              <View style={styles.meterRow}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: 6,
                      height: 8 + meter * 20 + ((i * 3) % 8),
                      borderRadius: 3,
                      backgroundColor: "#00A884",
                      opacity: 0.35 + meter * 0.65,
                    }}
                  />
                ))}
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, capturingSample && { opacity: 0.6 }]}
                onPress={() => void recordNextSample()}
                disabled={capturingSample}
              >
                <Ionicons name="mic" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>{capturingSample ? "Recording…" : "Record"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  void resetEnrollment();
                }}
                style={{ marginTop: 12 }}
              >
                <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {enrollPhase === "review" && (
            <View style={styles.enrollBox}>
              <Text style={[styles.enrollStep, { color: colors.foreground }]}>Review your voice</Text>
              <Text style={[styles.enrollHint, { color: colors.mutedForeground }]}>
                Play each sample. If it sounds wrong, record again.
              </Text>
              {samples.map((_, i) => (
                <View key={i} style={[styles.sampleRow, { borderColor: colors.border }]}>
                  <Text style={[styles.sampleLabel, { color: colors.foreground }]}>Sample {i + 1}</Text>
                  <TouchableOpacity
                    style={styles.playChip}
                    onPress={() => void playSample(i)}
                    disabled={playingIdx !== null}
                  >
                    <Ionicons
                      name={playingIdx === i ? "hourglass-outline" : "play"}
                      size={16}
                      color="#00A884"
                    />
                    <Text style={styles.playChipText}>
                      {playingIdx === i ? "Playing…" : "Play"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
                onPress={() => void confirmEnrollment()}
                disabled={saving}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>{saving ? "Saving…" : "Save voice profile"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={() => {
                  void resetEnrollment();
                  setEnrollPhase("recording");
                  setSampleIndex(0);
                }}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Record again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>EXAMPLE PHRASES (apne contacts / groups ke naam use karein)</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {[
            "[Naam] ko call karo / video call lagao",
            "[Naam] ko message bhejo …",
            "Aaj kis kis ka message aaya",
            "Kis ka call miss hua",
            "Kis group mein kitne message hain",
            "Kitne unread messages hain",
            "Mere chats kaun kaun hain",
            "Sab messages read kar do",
            "Privacy setting kahan hai",
            "Theme kaise change karein",
          ].map((cmd) => (
            <Text key={cmd} style={[styles.cmd, { color: colors.mutedForeground }]}>• {cmd}</Text>
          ))}
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => void activateManually()}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Test now — speak a command</Text>
          </TouchableOpacity>
          <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 10 }]}>
            [Naam] = jo contact ya group aapki chat list mein dikhta hai. Fixed examples nahi — aap jo chahein bol sakte hain. Ek line: &quot;Hey Videh [naam] ko call karo&quot;.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, textAlign: "center", color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  hero: { borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 20 },
  heroIcon: { marginBottom: 12 },
  heroTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 8 },
  heroSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 14, padding: 14, marginBottom: 18 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  divider: { height: StyleSheet.hairlineWidth },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8, lineHeight: 18 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#00A884",
    borderRadius: 28,
    paddingVertical: 14,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
  },
  dangerBtnText: { color: "#c62828", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  secondaryBtn: { marginTop: 12, borderWidth: 1, borderRadius: 24, paddingVertical: 12, alignItems: "center" },
  secondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  enrollBox: { alignItems: "center" },
  enrollStep: { fontSize: 16, fontFamily: "Inter_700Bold" },
  enrollHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 6, marginBottom: 14, textAlign: "center" },
  meterRow: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 36, marginBottom: 16 },
  sampleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  sampleLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  playChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  playChipText: { color: "#00A884", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cmd: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 22 },
});
