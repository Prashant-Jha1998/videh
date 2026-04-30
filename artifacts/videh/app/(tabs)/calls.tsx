import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp, type CallLog } from "@/context/AppContext";

function formatCallTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const d = new Date(ts);
  if (diff < 24 * 3600000) {
    const h = d.getHours(), m = d.getMinutes().toString().padStart(2, "0");
    return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
  }
  if (diff < 2 * 24 * 3600000) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function CallsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { callLogs } = useApp();
  const [tab, setTab] = useState<"all" | "missed">("all");
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const filtered = tab === "missed" ? callLogs.filter((c) => c.status === "missed") : callLogs;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Text style={styles.headerTitle}>Calls</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerBtn}>
            <Ionicons name="search-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn}>
            <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(["all", "missed"] as const).map((t) => (
          <TouchableOpacity key={t} style={styles.tabBtn} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
            {tab === t && <View style={[styles.tabLine, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const initials = item.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
          const hue = item.name.charCodeAt(0) * 37 % 360;
          const avatarBg = `hsl(${hue},50%,45%)`;
          const isMissed = item.status === "missed";
          const durationStr = item.duration ? ` · ${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, "0")}` : "";
          return (
            <View style={[styles.row, { borderBottomColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={styles.info}>
                <Text style={[styles.name, { color: isMissed ? colors.destructive : colors.foreground }]}>{item.name}</Text>
                <View style={styles.meta}>
                  <Ionicons
                    name={item.direction === "incoming" ? "arrow-down-outline" : "arrow-up-outline"}
                    size={14}
                    color={isMissed ? colors.destructive : colors.primary}
                  />
                  <Ionicons name={item.type === "video" ? "videocam-outline" : "call-outline"} size={14} color={colors.mutedForeground} />
                  <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                    {formatCallTime(item.timestamp)}{durationStr}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => router.push({ pathname: "/call/[id]", params: { id: item.id, name: item.name, type: item.type } })}
              >
                <Ionicons name={item.type === "video" ? "videocam" : "call"} size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="call-outline" size={60} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No missed calls</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.8}
        onPress={() => router.push("/contacts")}
      >
        <Ionicons name="call" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  headerRight: { flexDirection: "row" },
  headerBtn: { padding: 6 },
  tabs: { flexDirection: "row", borderBottomWidth: 0.5, marginHorizontal: 16 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabLine: { position: "absolute", bottom: 0, height: 2, width: "80%", borderRadius: 1 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 12 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  info: { flex: 1 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  metaText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  callBtn: { padding: 10 },
  empty: { alignItems: "center", marginTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  fab: { position: "absolute", bottom: 90, right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5 },
});
