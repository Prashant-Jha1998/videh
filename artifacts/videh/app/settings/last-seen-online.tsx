import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";
import {
  LAST_SEEN_PRIVACY_OPTIONS,
  ONLINE_PRIVACY_OPTIONS,
} from "@/lib/presence";

const BASE_URL = getApiUrl();

function RadioRow({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      style={[styles.radioRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
    >
      <Text style={[styles.radioLabel, { color: colors.foreground }]}>{label}</Text>
      <View style={[styles.radioOuter, { borderColor: selected ? colors.primary : colors.mutedForeground }]}>
        {selected ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
      </View>
    </Pressable>
  );
}

export default function LastSeenOnlineSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSeenPrivacy, setLastSeenPrivacy] = useState<string>("contacts");
  const [onlinePrivacy, setOnlinePrivacy] = useState<string>("same_as_last_seen");

  const load = useCallback(async () => {
    if (!user?.dbId) return;
    setLoading(true);
    try {
      const stored = await import("@react-native-async-storage/async-storage").then((m) =>
        m.default.getItem("videh_user"),
      );
      const token = stored ? JSON.parse(stored).sessionToken : undefined;
      const res = await fetch(`${BASE_URL}/api/users/${user.dbId}/privacy`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        setLastSeenPrivacy(data.lastSeenPrivacy ?? "contacts");
        setOnlinePrivacy(data.onlinePrivacy ?? "same_as_last_seen");
      }
    } catch {
      // defaults
    } finally {
      setLoading(false);
    }
  }, [user?.dbId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: { lastSeenPrivacy?: string; onlinePrivacy?: string }) => {
    if (!user?.dbId || saving) return;
    setSaving(true);
    const nextLast = patch.lastSeenPrivacy ?? lastSeenPrivacy;
    const nextOnline = patch.onlinePrivacy ?? onlinePrivacy;
    if (patch.lastSeenPrivacy) setLastSeenPrivacy(patch.lastSeenPrivacy);
    if (patch.onlinePrivacy) setOnlinePrivacy(patch.onlinePrivacy);
    try {
      const stored = await import("@react-native-async-storage/async-storage").then((m) =>
        m.default.getItem("videh_user"),
      );
      const token = stored ? JSON.parse(stored).sessionToken : undefined;
      await fetch(`${BASE_URL}/api/users/${user.dbId}/privacy`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          lastSeenPrivacy: nextLast,
          onlinePrivacy: nextOnline,
        }),
      });
    } catch {
      void load();
    } finally {
      setSaving(false);
    }
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Last seen and online</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            Who can see my last seen
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {LAST_SEEN_PRIVACY_OPTIONS.map((opt) => (
              <RadioRow
                key={opt.value}
                label={opt.label}
                selected={lastSeenPrivacy === opt.value}
                onPress={() => void save({ lastSeenPrivacy: opt.value })}
                colors={colors}
              />
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 20 }]}>
            Who can see when I&apos;m online
          </Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {ONLINE_PRIVACY_OPTIONS.map((opt) => (
              <RadioRow
                key={opt.value}
                label={opt.label}
                selected={onlinePrivacy === opt.value}
                onPress={() => void save({ onlinePrivacy: opt.value })}
                colors={colors}
              />
            ))}
          </View>

          <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
            If you don&apos;t share when you were last seen or online, you won&apos;t be able to see when other
            people were last seen or online.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginHorizontal: 20,
    marginBottom: 8,
    marginTop: 8,
  },
  card: { marginHorizontal: 12, borderRadius: 12, overflow: "hidden" },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  radioLabel: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular" },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioInner: { width: 12, height: 12, borderRadius: 6 },
  footerNote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginHorizontal: 20,
    marginTop: 16,
  },
});
