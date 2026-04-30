import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();

function platformIcon(platform: string): "logo-windows" | "logo-apple" | "desktop-outline" | "phone-portrait-outline" | "globe-outline" {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("windows")) return "logo-windows";
  if (p.includes("macos") || p.includes("ios")) return "logo-apple";
  if (p.includes("android")) return "phone-portrait-outline";
  if (p.includes("linux")) return "desktop-outline";
  return "globe-outline";
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function timeAgo(iso: string): string {
  if (!iso) return "Unknown";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return "Active now";
  if (mins < 60) return `${mins} min ago`;
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export default function DeviceDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ token: string; deviceName: string; platform: string; linkedAt: string; lastActive: string }>();

  const [name, setName] = useState(params.deviceName ?? "Unknown Device");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveName = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await fetch(`${BASE_URL}/api/web-session/${params.token}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
    } catch {}
    setSaving(false);
    setEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const confirmLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      "Log out device",
      `Log out "${name}" from your Videh account?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out",
          style: "destructive",
          onPress: async () => {
            try {
              await fetch(`${BASE_URL}/api/web-session/${params.token}`, { method: "DELETE" });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch {
              Alert.alert("Error", "Could not log out device. Please try again.");
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit device</Text>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => { setEditing(!editing); if (editing) saveName(); }}
          disabled={saving}
        >
          <Ionicons name={editing ? "checkmark" : "pencil-outline"} size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {/* Device icon */}
        <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
          <Ionicons name={platformIcon(params.platform ?? "")} size={52} color="#fff" />
        </View>

        {/* Device name (editable) */}
        {editing ? (
          <View style={[styles.nameInputRow, { borderColor: colors.primary, backgroundColor: colors.card }]}>
            <TextInput
              value={name}
              onChangeText={setName}
              style={[styles.nameInput, { color: colors.text }]}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveName}
              maxLength={40}
            />
          </View>
        ) : (
          <Text style={[styles.deviceName, { color: colors.text }]}>{name}</Text>
        )}
        <Text style={[styles.deviceType, { color: colors.mutedForeground }]}>Device name</Text>

        {/* Info rows */}
        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color={colors.mutedForeground} />
            <View style={styles.infoText}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Last active</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{timeAgo(params.lastActive ?? params.linkedAt)}</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.infoRow}>
            <Ionicons name="globe-outline" size={20} color={colors.mutedForeground} />
            <View style={styles.infoText}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Platform</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{params.platform ?? "Web"}</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.mutedForeground} />
            <View style={styles.infoText}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Linked on</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{formatDate(params.linkedAt)}</Text>
            </View>
          </View>
        </View>

        {/* Log out button */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: "#e53e3e" }]}
          onPress={confirmLogout}
          activeOpacity={0.7}
        >
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>

        <Text style={[styles.notice, { color: colors.mutedForeground }]}>
          If you don't recognise this device or can't access it any longer you should log out of it.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: 14, paddingHorizontal: 16, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "700", flex: 1 },
  editBtn: { padding: 4 },
  body: { flex: 1, alignItems: "center", paddingHorizontal: 24, paddingTop: 36 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  deviceName: { fontSize: 22, fontWeight: "700", marginBottom: 4, textAlign: "center" },
  deviceType: { fontSize: 14, marginBottom: 32 },
  nameInputRow: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, width: "100%", marginBottom: 4 },
  nameInput: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  infoCard: { width: "100%", borderRadius: 14, overflow: "hidden", marginBottom: 28 },
  infoRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  infoText: { flex: 1, gap: 2 },
  infoLabel: { fontSize: 12 },
  infoValue: { fontSize: 15, fontWeight: "500" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 50 },
  logoutBtn: { width: "100%", borderWidth: 1.5, borderRadius: 28, paddingVertical: 15, alignItems: "center", marginBottom: 16 },
  logoutText: { color: "#e53e3e", fontWeight: "700", fontSize: 16 },
  notice: { fontSize: 13, textAlign: "center", lineHeight: 19 },
});
