import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { WEB_LIST_PANE_WIDTH } from "@/lib/web/webDesktop";
import { WebFilterChips } from "@/components/web/WebFilterChips";
import { filterCallLogs } from "@/lib/callLogFilter";

function formatCallTime(ts: number): string {
  const diff = Date.now() - ts;
  const d = new Date(ts);
  if (diff < 24 * 3600000) {
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h % 12 || 12}:${m} ${h >= 12 ? "pm" : "am"}`;
  }
  if (diff < 2 * 24 * 3600000) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

type Props = { width?: number };

export function WebCallsListPane({ width = WEB_LIST_PANE_WIDTH }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { callLogs } = useApp();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const filtered = useMemo(
    () => filterCallLogs(callLogs, { tab: tab as "all" | "missed", query: search }),
    [callLogs, search, tab],
  );

  return (
    <View style={[styles.pane, { width, borderRightColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <Text style={styles.headerTitle}>Calls</Text>
        <TouchableOpacity onPress={() => router.push("/contacts")} hitSlop={8}>
          <Ionicons name="call-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search name or number"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <WebFilterChips
        chips={[
          { id: "all", label: "All" },
          { id: "missed", label: "Missed", count: callLogs.filter((c) => c.status === "missed").length },
        ]}
        activeId={tab}
        onChange={setTab}
      />
      <Text style={[styles.section, { color: colors.mutedForeground }]}>Recent</Text>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const missed = item.status === "missed";
          const initials = item.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
          const hue = item.name.charCodeAt(0) * 37 % 360;
          return (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() =>
                item.chatId &&
                router.push({
                  pathname: "/call/[id]",
                  params: { id: item.chatId, name: item.name, type: item.type },
                })
              }
              activeOpacity={0.75}
            >
              <View style={[styles.avatar, { backgroundColor: `hsl(${hue},50%,45%)` }]}>
                <Text style={styles.avatarTxt}>{initials}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.name, { color: missed ? "#ef4444" : colors.foreground }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.meta}>
                  <Ionicons
                    name={item.direction === "incoming" ? "arrow-down-outline" : "arrow-up-outline"}
                    size={14}
                    color={missed ? "#ef4444" : colors.primary}
                  />
                  <Text style={[styles.metaTxt, { color: missed ? "#ef4444" : colors.mutedForeground }]}>
                    {missed ? "Missed" : item.status === "declined" ? "Declined" : "Outgoing"}
                  </Text>
                </View>
              </View>
              <Text style={[styles.time, { color: colors.mutedForeground }]}>{formatCallTime(item.timestamp)}</Text>
              <TouchableOpacity
                onPress={() =>
                  item.chatId &&
                  router.push({
                    pathname: "/call/[id]",
                    params: { id: item.chatId, name: item.name, type: item.type },
                  })
                }
                hitSlop={8}
              >
                <Ionicons name={item.type === "video" ? "videocam" : "call"} size={22} color={colors.primary} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: colors.mutedForeground }}>No calls yet</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { borderRightWidth: StyleSheet.hairlineWidth, height: "100%" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 20,
  },
  headerTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_600SemiBold" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8, fontFamily: "Inter_400Regular" },
  section: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontFamily: "Inter_500Medium" },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  metaTxt: { fontSize: 13, fontFamily: "Inter_400Regular" },
  time: { fontSize: 12, fontFamily: "Inter_400Regular", marginRight: 4 },
  empty: { padding: 32, alignItems: "center" },
});
