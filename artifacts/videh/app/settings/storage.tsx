import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Platform,
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
const API_URL = `${getApiUrl()}/api`;

interface StorageStats {
  totalMessages: number;
  mediaMessages: number;
  textMessages: number;
  totalChats: number;
}

export default function StorageScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [autoDownloadImages, setAutoDownloadImages] = useState(true);
  const [autoDownloadVideos, setAutoDownloadVideos] = useState(false);
  const [autoDownloadDocs, setAutoDownloadDocs] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const r = await fetch(`${API_URL}/users/${user.dbId}/storage-stats`);
        const d = await r.json();
        if (d.success) setStats(d.stats);
      } catch {}
    };
    load();
  }, [user]);

  const fmtNum = (n: number) => n?.toLocaleString("en-IN") ?? "—";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Storage and Data</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        {/* Stats */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>ACCOUNT USAGE</Text>
          <StatRow icon="chatbubbles-outline" iconBg="#2196F3" label="Total Chats" value={fmtNum(stats?.totalChats ?? 0)} colors={colors} />
          <StatRow icon="text-outline" iconBg="#4CAF50" label="Text Messages" value={fmtNum(stats?.textMessages ?? 0)} colors={colors} />
          <StatRow icon="image-outline" iconBg="#FF9800" label="Media Messages" value={fmtNum(stats?.mediaMessages ?? 0)} colors={colors} />
          <StatRow icon="mail-outline" iconBg="#9C27B0" label="Total Messages" value={fmtNum(stats?.totalMessages ?? 0)} colors={colors} last />
        </View>

        {/* Auto-download */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>AUTO-DOWNLOAD MEDIA</Text>
          <ToggleRow
            icon="image-outline" iconBg="#FF5722"
            label="Photos"
            value="Mobile data & WiFi"
            enabled={autoDownloadImages}
            onToggle={() => setAutoDownloadImages(v => !v)}
            colors={colors}
          />
          <ToggleRow
            icon="videocam-outline" iconBg="#E91E63"
            label="Videos"
            value="WiFi only"
            enabled={autoDownloadVideos}
            onToggle={() => setAutoDownloadVideos(v => !v)}
            colors={colors}
          />
          <ToggleRow
            icon="document-outline" iconBg="#607D8B"
            label="Documents"
            value="Mobile data & WiFi"
            enabled={autoDownloadDocs}
            onToggle={() => setAutoDownloadDocs(v => !v)}
            colors={colors}
            last
          />
        </View>

        {/* Network */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionLabel, { color: colors.primary }]}>NETWORK</Text>
          <StatRow icon="wifi-outline" iconBg="#00BCD4" label="Use less data for calls" value="OFF" colors={colors} />
          <StatRow icon="cellular-outline" iconBg="#009688" label="Proxy" value="None" colors={colors} last />
        </View>

        {/* Clear cache */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            style={styles.dangerRow}
            onPress={() => Alert.alert("Cache Clear", "App cache clear ho gaya.", [{ text: "OK" }])}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={20} color={colors.destructive} />
            <View>
              <Text style={[styles.dangerLabel, { color: colors.destructive }]}>Cache Clear Karo</Text>
              <Text style={[styles.dangerHint, { color: colors.mutedForeground }]}>Temporary files delete honge</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function StatRow({ icon, iconBg, label, value, colors, last }: any) {
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}>
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>
    </View>
  );
}

function ToggleRow({ icon, iconBg, label, value, enabled, onToggle, colors, last }: any) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && { borderBottomWidth: 0.5, borderBottomColor: colors.border }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{value}</Text>
      </View>
      <View style={[styles.toggle, { backgroundColor: enabled ? colors.primary : colors.muted }]}>
        <View style={[styles.toggleKnob, { transform: [{ translateX: enabled ? 18 : 0 }], backgroundColor: "#fff" }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12 },
  backBtn: { padding: 8 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  section: { marginBottom: 10, paddingHorizontal: 16, paddingVertical: 8 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, paddingTop: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 14 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  rowValue: { fontSize: 14, fontFamily: "Inter_400Regular" },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: "center", padding: 2 },
  toggleKnob: { width: 22, height: 22, borderRadius: 11 },
  dangerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 },
  dangerLabel: { fontSize: 16, fontFamily: "Inter_500Medium" },
  dangerHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
});
