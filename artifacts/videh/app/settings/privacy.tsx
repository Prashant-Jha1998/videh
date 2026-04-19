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

const VISIBILITY_OPTIONS = ["Everyone", "My contacts", "Nobody"];

function VisibilityChooser({ label, value, onChange, colors }: { label: string; value: string; onChange: (v: string) => void; colors: any }) {
  return (
    <TouchableOpacity
      style={[styles.privacyRow, { borderBottomColor: colors.border }]}
      onPress={() => Alert.alert(label, "Who can see your " + label.toLowerCase(), VISIBILITY_OPTIONS.map((o) => ({ text: o, onPress: () => onChange(o) })))}
      activeOpacity={0.7}
    >
      <Text style={[styles.privacyLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.privacyRight}>
        <Text style={[styles.privacyValue, { color: colors.mutedForeground }]}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );
}

export default function PrivacySettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [lastSeen, setLastSeen] = useState("My contacts");
  const [profilePhoto, setProfilePhoto] = useState("My contacts");
  const [about, setAbout] = useState("My contacts");
  const [status, setStatus] = useState("My contacts");
  const [groups, setGroups] = useState("Everyone");
  const [readReceipts, setReadReceipts] = useState(true);
  const [disappearing, setDisappearing] = useState(false);
  const [callsPrivacy, setCallsPrivacy] = useState(false);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        {/* Who can see info */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Who can see my personal info</Text>
          <VisibilityChooser label="Last seen" value={lastSeen} onChange={setLastSeen} colors={colors} />
          <VisibilityChooser label="Profile photo" value={profilePhoto} onChange={setProfilePhoto} colors={colors} />
          <VisibilityChooser label="About" value={about} onChange={setAbout} colors={colors} />
          <VisibilityChooser label="Status" value={status} onChange={setStatus} colors={colors} />
          <VisibilityChooser label="Groups" value={groups} onChange={setGroups} colors={colors} />
        </View>

        {/* Messaging */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Messaging</Text>
          <SwitchRow
            label="Read receipts"
            hint="When turned off, you won't send or receive Read receipts. Read receipts are always sent for group chats."
            value={readReceipts}
            onChange={setReadReceipts}
            colors={colors}
          />
        </View>

        {/* Default message timer */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Default message timer</Text>
          <TouchableOpacity
            style={styles.privacyRow}
            onPress={() => Alert.alert("Default Timer", "Set disappearing messages for new chats", [
              { text: "Off", onPress: () => setDisappearing(false) },
              { text: "24 hours", onPress: () => setDisappearing(true) },
              { text: "7 days", onPress: () => setDisappearing(true) },
              { text: "90 days", onPress: () => setDisappearing(true) },
              { text: "Cancel", style: "cancel" },
            ])}
            activeOpacity={0.7}
          >
            <Text style={[styles.privacyLabel, { color: colors.foreground }]}>Disappearing messages</Text>
            <View style={styles.privacyRight}>
              <Text style={[styles.privacyValue, { color: colors.mutedForeground }]}>{disappearing ? "On" : "Off"}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Calls */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>Calls</Text>
          <SwitchRow
            label="Silence unknown callers"
            hint="Calls from unknown numbers will be silenced and shown in the call log."
            value={callsPrivacy}
            onChange={setCallsPrivacy}
            colors={colors}
          />
        </View>

        {/* Blocked contacts */}
        <TouchableOpacity
          style={[styles.section, { backgroundColor: colors.card }]}
          onPress={() => Alert.alert("Blocked Contacts", "No blocked contacts")}
          activeOpacity={0.7}
        >
          <View style={styles.blockedRow}>
            <Ionicons name="ban-outline" size={20} color={colors.destructive} />
            <Text style={[styles.blockedLabel, { color: colors.destructive }]}>Blocked contacts</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} style={{ marginLeft: "auto" }} />
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SwitchRow({ label, hint, value, onChange, colors }: any) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={[styles.switchLabel, { color: colors.foreground }]}>{label}</Text>
        {hint && <Text style={[styles.switchHint, { color: colors.mutedForeground }]}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} thumbColor={value ? colors.primary : "#f4f3f4"} trackColor={{ true: colors.primary + "80" }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  section: { marginBottom: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 },
  privacyRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 0.5 },
  privacyLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  privacyRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  privacyValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  switchRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 10 },
  switchLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  switchHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 17 },
  blockedRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  blockedLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
});
