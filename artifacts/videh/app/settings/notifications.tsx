import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { useColors } from "@/hooks/useColors";
import {
  getCallAudioPrefs,
  labelForCallRingtone,
  setCallVibratePref,
} from "@/lib/callAudioPrefs";
import { getCallMediaSettings, setCallLowDataMode } from "@/lib/callMediaSettings";
import { labelForSoundId } from "@/lib/premiumSounds";
import { getSoundPrefs } from "@/lib/soundPrefs";

const PREVIEW_OPTIONS = ["Always show preview", "Only show sender name", "No preview"];

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [msgNotifs, setMsgNotifs] = useState(true);
  const [msgTone, setMsgTone] = useState("Default");
  const [msgVibrate, setMsgVibrate] = useState(true);
  const [msgPreview, setMsgPreview] = useState("Always show preview");
  const [groupNotifs, setGroupNotifs] = useState(true);
  const [groupTone, setGroupTone] = useState("Default");
  const [groupVibrate, setGroupVibrate] = useState(true);
  const [callRingtone, setCallRingtone] = useState("Default");
  const [callVibrate, setCallVibrate] = useState(true);
  const [callNotifs, setCallNotifs] = useState(true);
  const [callLowData, setCallLowData] = useState(false);
  const [statusNotifs, setStatusNotifs] = useState(true);
  const [reactionNotifs, setReactionNotifs] = useState(true);

  const loadPrefs = useCallback(async () => {
    const [callPrefs, soundPrefs, media] = await Promise.all([
      getCallAudioPrefs(),
      getSoundPrefs(),
      getCallMediaSettings(),
    ]);
    setCallRingtone(labelForCallRingtone(callPrefs.ringtone));
    setCallVibrate(callPrefs.vibrate);
    setMsgTone(labelForSoundId(soundPrefs.globalMessageSound));
    setGroupTone(labelForSoundId(soundPrefs.globalGroupMessageSound));
    setCallLowData(media.lowDataMode);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPrefs();
    }, [loadPrefs]),
  );

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const onCallVibrateChange = (value: boolean) => {
    setCallVibrate(value);
    void setCallVibratePref(value);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        <TouchableOpacity
          style={[styles.premiumBanner, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}
          onPress={() => router.push("/settings/premium-sounds")}
          activeOpacity={0.85}
        >
          <Ionicons name="musical-notes" size={26} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.premiumTitle, { color: colors.foreground }]}>Premium sounds</Text>
            <Text style={[styles.premiumSub, { color: colors.mutedForeground }]}>
              Ringtones, VIP tones, sound packs & per-contact sounds
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Messages</Text>
          <SwitchRow label="Conversation notifications" value={msgNotifs} onChange={setMsgNotifs} colors={colors} />
          {msgNotifs && (
            <>
              <TappableRow
                label="Notification tone"
                value={msgTone}
                onPress={() => router.push("/settings/premium-sounds")}
                colors={colors}
              />
              <SwitchRow label="Vibrate" value={msgVibrate} onChange={setMsgVibrate} colors={colors} />
              <TappableRow
                label="Popup notification"
                value={msgPreview}
                onPress={() =>
                  Alert.alert(
                    "Notification preview",
                    "",
                    PREVIEW_OPTIONS.map((p) => ({ text: p, onPress: () => setMsgPreview(p) })),
                  )
                }
                colors={colors}
                last
              />
            </>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Groups</Text>
          <SwitchRow label="Group notifications" value={groupNotifs} onChange={setGroupNotifs} colors={colors} />
          {groupNotifs && (
            <>
              <TappableRow
                label="Notification tone"
                value={groupTone}
                onPress={() => router.push("/settings/premium-sounds")}
                colors={colors}
              />
              <SwitchRow label="Vibrate" value={groupVibrate} onChange={setGroupVibrate} colors={colors} last />
            </>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Calls</Text>
          <SwitchRow label="Call notifications" value={callNotifs} onChange={setCallNotifs} colors={colors} />
          {callNotifs && (
            <>
              <TappableRow
                label="Ringtone"
                value={callRingtone}
                onPress={() => router.push("/settings/premium-sounds")}
                colors={colors}
              />
              <SwitchRow label="Vibrate" value={callVibrate} onChange={onCallVibrateChange} colors={colors} />
              <SwitchRow
                label="Use less data for calls"
                value={callLowData}
                onChange={(v: boolean) => {
                  setCallLowData(v);
                  void setCallLowDataMode(v);
                }}
                colors={colors}
                last
              />
            </>
          )}
        </View>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Other</Text>
          <SwitchRow label="Status notifications" value={statusNotifs} onChange={setStatusNotifs} colors={colors} />
          <SwitchRow label="Reaction notifications" value={reactionNotifs} onChange={setReactionNotifs} colors={colors} last />
        </View>
      </ScrollView>
    </View>
  );
}

function SwitchRow({ label, value, onChange, colors, last }: any) {
  return (
    <View style={[styles.switchRow, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} thumbColor={value ? colors.primary : "#f4f3f4"} trackColor={{ true: colors.primary + "80" }} />
    </View>
  );
}

function TappableRow({ label, value, onPress, colors, last }: any) {
  return (
    <TouchableOpacity
      style={[styles.tappableRow, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  premiumBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  premiumTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  premiumSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { marginBottom: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  tappableRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
