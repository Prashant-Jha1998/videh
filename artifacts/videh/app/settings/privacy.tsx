import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";

const VISIBILITY_OPTIONS = ["Everyone", "My contacts", "Nobody"];
const BASE_URL = getApiUrl();

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
  const { user, unblockUser } = useApp();

  const [lastSeen, setLastSeen] = useState("My contacts");
  const [profilePhoto, setProfilePhoto] = useState("My contacts");
  const [about, setAbout] = useState("My contacts");
  const [status, setStatus] = useState("My contacts");
  const [groups, setGroups] = useState("Everyone");
  const [readReceipts, setReadReceipts] = useState(true);
  const [disappearing, setDisappearing] = useState(false);
  const [callsPrivacy, setCallsPrivacy] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [blocked, setBlocked] = useState<Array<{ id: number; name?: string | null; phone?: string; avatar_url?: string | null }>>([]);

  const loadBlocked = useCallback(async () => {
    if (!user?.dbId) return;
    try {
      const res = await fetch(`${BASE_URL}/api/users/${user.dbId}/blocked`);
      const data = await res.json();
      if (data.success) setBlocked(data.blocked ?? []);
    } catch {}
  }, [user?.dbId]);

  useEffect(() => {
    void loadBlocked();
  }, [loadBlocked]);

  const openBlocked = async () => {
    await loadBlocked();
    setBlockedOpen(true);
  };

  const confirmUnblock = (contact: { id: number; name?: string | null; phone?: string }) => {
    Alert.alert(`Unblock ${contact.name || contact.phone || "contact"}?`, "They will be able to message and call you again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unblock",
        onPress: async () => {
          await unblockUser(contact.id);
          setBlocked((prev) => prev.filter((item) => item.id !== contact.id));
        },
      },
    ]);
  };

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
          onPress={openBlocked}
          activeOpacity={0.7}
        >
          <View style={styles.blockedRow}>
            <Ionicons name="ban-outline" size={20} color={colors.destructive} />
            <Text style={[styles.blockedLabel, { color: colors.destructive }]}>Blocked contacts</Text>
            <Text style={[styles.privacyValue, { color: colors.mutedForeground }]}>{blocked.length}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} style={{ marginLeft: "auto" }} />
          </View>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={blockedOpen} transparent animationType="fade" onRequestClose={() => setBlockedOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setBlockedOpen(false)} />
          <View style={[styles.blockedSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Blocked contacts</Text>
            <Text style={[styles.modalHint, { color: colors.mutedForeground }]}>
              Blocked contacts cannot message, call, or see your status updates.
            </Text>
            {blocked.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No blocked contacts</Text>
            ) : blocked.map((contact) => (
              <TouchableOpacity key={contact.id} style={[styles.blockedContactRow, { borderTopColor: colors.border }]} onPress={() => confirmUnblock(contact)}>
                <View style={[styles.blockedAvatar, { backgroundColor: colors.primary }]}>
                  <Text style={styles.blockedAvatarText}>{(contact.name || contact.phone || "?").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.blockedContactName, { color: colors.foreground }]}>{contact.name || contact.phone || "Unknown contact"}</Text>
                  {!!contact.phone && <Text style={[styles.blockedContactPhone, { color: colors.mutedForeground }]}>{contact.phone}</Text>}
                </View>
                <Text style={[styles.unblockText, { color: colors.primary }]}>Unblock</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalClose} onPress={() => setBlockedOpen(false)}>
              <Text style={[styles.modalCloseText, { color: colors.primary }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  blockedSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 28 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  modalHint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 12 },
  emptyText: { textAlign: "center", paddingVertical: 28, fontFamily: "Inter_400Regular" },
  blockedContactRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 0.5 },
  blockedAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  blockedAvatarText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  blockedContactName: { fontFamily: "Inter_500Medium", fontSize: 15 },
  blockedContactPhone: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  unblockText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  modalClose: { alignItems: "center", paddingTop: 12 },
  modalCloseText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
