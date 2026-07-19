import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { getApiUrl } from "@/lib/api";

const API_URL = `${getApiUrl()}/api`;

export default function AccountSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useApp();
  const { t } = useUiPreferences();
  const [twoStepEnabled, setTwoStepEnabled] = useState(false);
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (user?.sessionToken) h.Authorization = `Bearer ${user.sessionToken}`;
    return h;
  }, [user?.sessionToken]);

  const refreshTwoStep = useCallback(async () => {
    if (!user?.dbId) return;
    try {
      const r = await fetch(`${API_URL}/users/${user.dbId}/two-step-status`, {
        headers: authHeaders(),
      });
      const d = await r.json();
      if (d.success) setTwoStepEnabled(!!d.enabled);
    } catch {
      setTwoStepEnabled(false);
    }
  }, [user?.dbId, authHeaders]);

  useEffect(() => {
    void refreshTwoStep();
  }, [refreshTwoStep]);

  useFocusEffect(
    useCallback(() => {
      void refreshTwoStep();
    }, [refreshTwoStep]),
  );

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const changeNumber = () => {
    Alert.alert(
      "Change Number",
      "We will send an OTP to your new number to verify it. Your chat history will be moved to the new number.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", onPress: () => router.push("/settings/change-number") },
      ],
    );
  };

  const requestInfo = async () => {
    if (!user?.dbId || busy) return;
    setBusy("export");
    try {
      const r = await fetch(`${API_URL}/users/${user.dbId}/account-export`, {
        headers: authHeaders(),
      });
      const d = await r.json() as { success?: boolean; report?: unknown; exportedAt?: string; message?: string };
      if (!r.ok || !d.success || !d.report) {
        Alert.alert("Error", d.message ?? "Could not create account report.");
        return;
      }
      const text = JSON.stringify({ exportedAt: d.exportedAt, report: d.report }, null, 2);
      await Share.share({
        message: text,
        title: "Videh account information",
      });
    } catch {
      Alert.alert("Error", "Could not create account report.");
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = () => {
    if (busy) return;
    Alert.alert(
      "Delete Account",
      "Deleting your account will:\n• Remove your profile from Videh\n• Sign you out on all devices\n• Stop notifications and SOS contacts\n\nChat history already received by others may remain on their devices. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "This is permanent and cannot be undone.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: async () => {
                    if (!user?.dbId) return;
                    setBusy("delete");
                    try {
                      const r = await fetch(`${API_URL}/users/${user.dbId}`, {
                        method: "DELETE",
                        headers: authHeaders(),
                      });
                      const d = await r.json().catch(() => ({})) as { success?: boolean; message?: string };
                      if (!r.ok || !d.success) {
                        Alert.alert("Error", d.message ?? "Could not delete account.");
                        return;
                      }
                      await logout();
                      router.replace("/auth/phone");
                    } catch {
                      Alert.alert("Error", "Could not delete account.");
                    } finally {
                      setBusy(null);
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.headerIconColor} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("account.title")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>{t("account.phoneSection")}</Text>
          <View style={styles.infoRow}>
            <Text style={[styles.infoValue, { color: colors.foreground }]}>+91 {user?.phone}</Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingRow
            icon="lock-closed-outline"
            iconBg="#9C27B0"
            label={t("account.twoStep")}
            value={twoStepEnabled ? t("account.twoStepOn") : t("account.twoStepOff")}
            colors={colors}
            onPress={() => router.push("/settings/two-step")}
          />
          <SettingRow
            icon="key-outline"
            iconBg="#2196F3"
            label="Change number"
            value="Transfer account to new number"
            colors={colors}
            onPress={changeNumber}
          />
          <SettingRow
            icon="phone-portrait-outline"
            iconBg="#00BCD4"
            label="Linked devices"
            value="Use Videh on other devices"
            colors={colors}
            onPress={() => router.push("/linked-devices")}
            last
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingRow
            icon="document-text-outline"
            iconBg="#FF9800"
            label="Request account info"
            value={busy === "export" ? "Preparing…" : "Download a summary of your account"}
            colors={colors}
            onPress={() => { void requestInfo(); }}
            last
          />
        </View>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.deleteRow}
            onPress={deleteAccount}
            activeOpacity={0.7}
            disabled={busy === "delete"}
          >
            {busy === "delete" ? (
              <ActivityIndicator color={colors.destructive} />
            ) : (
              <Ionicons name="trash-outline" size={20} color={colors.destructive} />
            )}
            <View>
              <Text style={[styles.deleteLabel, { color: colors.destructive }]}>Delete account</Text>
              <Text style={[styles.deleteHint, { color: colors.mutedForeground }]}>
                Permanently delete your Videh account
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingRow({ icon, iconBg, label, value, colors, onPress, right, last }: any) {
  return (
    <TouchableOpacity
      style={[styles.settingRow, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={!onPress && !right}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.settingIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingLabel, { color: colors.foreground }]}>{label}</Text>
        {value && <Text style={[styles.settingValue, { color: colors.mutedForeground }]}>{value}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} /> : null)}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  section: { marginBottom: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  infoRow: { paddingVertical: 6 },
  infoValue: { fontSize: 16, fontFamily: "Inter_400Regular" },
  settingRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  settingValue: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  deleteRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 },
  deleteLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  deleteHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
});
