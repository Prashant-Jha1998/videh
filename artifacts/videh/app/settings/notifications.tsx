import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
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

const TONES = ["Default", "Chime", "Note", "Pulse", "Ringtone 1", "Ringtone 2", "None"];
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
  const [statusNotifs, setStatusNotifs] = useState(true);
  const [reactionNotifs, setReactionNotifs] = useState(true);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const pickTone = (current: string, onPick: (v: string) => void) => {
    Alert.alert("Notification tone", "", TONES.map((t) => ({ text: t, onPress: () => onPick(t) })));
  };

  const pickPreview = (current: string, onPick: (v: string) => void) => {
    Alert.alert("Notification preview", "", PREVIEW_OPTIONS.map((p) => ({ text: p, onPress: () => onPick(p) })));
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
        {/* Messages */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Messages</Text>
          <SwitchRow label="Conversation notifications" value={msgNotifs} onChange={setMsgNotifs} colors={colors} />
          {msgNotifs && (
            <>
              <TappableRow label="Notification tone" value={msgTone} onPress={() => pickTone(msgTone, setMsgTone)} colors={colors} />
              <SwitchRow label="Vibrate" value={msgVibrate} onChange={setMsgVibrate} colors={colors} />
              <TappableRow label="Popup notification" value={msgPreview} onPress={() => pickPreview(msgPreview, setMsgPreview)} colors={colors} last />
            </>
          )}
        </View>

        {/* Groups */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Groups</Text>
          <SwitchRow label="Group notifications" value={groupNotifs} onChange={setGroupNotifs} colors={colors} />
          {groupNotifs && (
            <>
              <TappableRow label="Notification tone" value={groupTone} onPress={() => pickTone(groupTone, setGroupTone)} colors={colors} />
              <SwitchRow label="Vibrate" value={groupVibrate} onChange={setGroupVibrate} colors={colors} last />
            </>
          )}
        </View>

        {/* Calls */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Calls</Text>
          <SwitchRow label="Call notifications" value={callNotifs} onChange={setCallNotifs} colors={colors} />
          {callNotifs && (
            <>
              <TappableRow label="Ringtone" value={callRingtone} onPress={() => pickTone(callRingtone, setCallRingtone)} colors={colors} />
              <SwitchRow label="Vibrate" value={callVibrate} onChange={setCallVibrate} colors={colors} last />
            </>
          )}
        </View>

        {/* Others */}
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
  section: { marginBottom: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  tappableRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
