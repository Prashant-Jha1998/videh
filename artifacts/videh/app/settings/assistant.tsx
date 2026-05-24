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
import { enrollAssistantVoice, patchAssistantPrefs } from "@/lib/assistantApi";
import { isSpeechRecognitionAvailable } from "@/lib/assistantSpeech";
import { recordVoiceSample } from "@/lib/voiceEnrollment";
import { useColors } from "@/hooks/useColors";

const ENROLLMENT_SAMPLES = 3;

export default function AssistantSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const { prefs, refreshPrefs, setEnabled, activateManually } = useAssistant();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [enrolling, setEnrolling] = useState(false);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [samples, setSamples] = useState<Array<{ durationMs: number; rmsLevels: number[]; peakLevel: number }>>([]);
  const [meter, setMeter] = useState(0.2);
  const [listenLocked, setListenLocked] = useState(true);

  useEffect(() => {
    if (prefs) setListenLocked(prefs.listenWhenLocked);
  }, [prefs]);

  const startEnrollment = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Mobile app required", "Hey Videh voice setup works on the Android/iOS app.");
      return;
    }
    setEnrolling(true);
    setSampleIndex(0);
    setSamples([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const recordNextSample = useCallback(async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const fp = await recordVoiceSample(2400, setMeter);
      const next = [...samples, fp];
      setSamples(next);
      if (next.length >= ENROLLMENT_SAMPLES) {
        const ok = await enrollAssistantVoice(user?.sessionToken, next);
        setEnrolling(false);
        if (ok) {
          await refreshPrefs();
          Alert.alert("Voice set!", "Ab sirf aapka awaaz se Hey Videh activate hoga.");
        } else {
          Alert.alert("Error", "Voice profile save nahi ho payi. Dubara try karein.");
        }
      } else {
        setSampleIndex(next.length);
      }
    } catch (e: any) {
      Alert.alert("Mic error", e?.message ?? "Recording failed");
      setEnrolling(false);
    }
  }, [samples, user?.sessionToken, refreshPrefs]);

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
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>India ka AI voice assistant</Text>
          <Text style={[styles.heroSub, { color: colors.mutedForeground }]}>
            Hindi, English, Tamil, Telugu, Bengali, Marathi, Gujarati aur aur bhi — jis bhasha mein bologe, usi mein jawab milega.
            Kaam poora karke batayega "kaam ho gaya". Galat/unsafe sawaal par jawab nahi dega.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>STATUS</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Row
            label="Voice enrolled"
            value={prefs?.voiceEnrolled ? "Yes" : "No"}
            colors={colors}
          />
          <Row
            label="Speech recognition"
            value={isSpeechRecognitionAvailable() ? "Ready" : "Needs mobile app"}
            colors={colors}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CONTROLS</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.switchRow}>
            <Text style={[styles.rowLabel, { color: colors.foreground }]}>Hey Videh enabled</Text>
            <Switch
              value={Boolean(prefs?.enabled)}
              onValueChange={(v) => void setEnabled(v)}
              disabled={!prefs?.voiceEnrolled}
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
            Lock screen par poori tarah sunne ke liye Android par background permission chahiye (Phase 2).
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>VOICE SETUP</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {!enrolling ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void startEnrollment()}>
              <Ionicons name="recording" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {prefs?.voiceEnrolled ? "Voice dubara set karein" : "Hey Videh bol kar voice set karein"}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.enrollBox}>
              <Text style={[styles.enrollStep, { color: colors.foreground }]}>
                Sample {sampleIndex + 1} / {ENROLLMENT_SAMPLES}
              </Text>
              <Text style={[styles.enrollHint, { color: colors.mutedForeground }]}>
                Button dabayein aur clearly bolein: "Hey Videh"
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
              <TouchableOpacity style={styles.primaryBtn} onPress={() => void recordNextSample()}>
                <Ionicons name="mic" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>Record karein</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEnrolling(false)} style={{ marginTop: 12 }}>
                <Text style={{ color: colors.mutedForeground, textAlign: "center" }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TRY COMMANDS</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {[
            "Amit ko message bhejo ki main late aaunga",
            "Priya ko call karo",
            "Aaj kahan se message aaya",
            "Sab messages read kar do",
            "Meri broadcast lists batao",
            "Family group ka khata sunao",
          ].map((cmd) => (
            <Text key={cmd} style={[styles.cmd, { color: colors.mutedForeground }]}>• {cmd}</Text>
          ))}
          {prefs?.voiceEnrolled ? (
            <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={() => void activateManually()}>
              <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Abhi test karein</Text>
            </TouchableOpacity>
          ) : null}
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
  secondaryBtn: { marginTop: 14, borderWidth: 1, borderRadius: 24, paddingVertical: 12, alignItems: "center" },
  secondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  enrollBox: { alignItems: "center" },
  enrollStep: { fontSize: 16, fontFamily: "Inter_700Bold" },
  enrollHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 6, marginBottom: 14, textAlign: "center" },
  meterRow: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 36, marginBottom: 16 },
  cmd: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 22 },
});
