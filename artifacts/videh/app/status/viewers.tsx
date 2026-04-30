import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { formatTime } from "@/utils/time";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();

interface Viewer {
  id: number;
  name: string;
  avatar?: string;
  viewed_at: string;
  reaction?: string;
}

type Tab = "all" | "reactions";

export default function StatusViewersScreen() {
  const { statusId } = useLocalSearchParams<{ statusId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { user } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [loading, setLoading] = useState(true);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    if (!statusId || !user?.dbId) return;
    fetch(`${BASE_URL}/api/statuses/${statusId}/viewers?ownerId=${user.dbId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setViewers(data.viewers ?? []);
          setReactions(data.reactions ?? {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusId]);

  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);
  const displayList = tab === "reactions"
    ? viewers.filter((v) => !!v.reaction)
    : viewers;

  const reactionEntries = Object.entries(reactions).sort((a, b) => b[1] - a[1]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Status info</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={displayList}
          keyExtractor={(item) => String(item.id)}
          ListHeaderComponent={
            <View>
              {/* Stats row */}
              <View style={[styles.statsRow, { backgroundColor: colors.card }]}>
                <View style={styles.statItem}>
                  <Ionicons name="eye-outline" size={26} color={colors.primary} />
                  <Text style={[styles.statNumber, { color: colors.foreground }]}>{viewers.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Views</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statItem}>
                  <Text style={{ fontSize: 24 }}>❤️</Text>
                  <Text style={[styles.statNumber, { color: colors.foreground }]}>{totalReactions}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Reactions</Text>
                </View>
              </View>

              {/* Reaction breakdown chips */}
              {reactionEntries.length > 0 && (
                <View style={[styles.reactionBreakdown, { backgroundColor: colors.card }]}>
                  {reactionEntries.map(([emoji, count]) => (
                    <View key={emoji} style={[styles.reactionBreakdownChip, { backgroundColor: colors.background }]}>
                      <Text style={styles.chipEmoji}>{emoji}</Text>
                      <Text style={[styles.chipCount, { color: colors.foreground }]}>{count}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Tabs */}
              <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.tab, tab === "all" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                  onPress={() => setTab("all")}
                >
                  <Text style={[styles.tabText, { color: tab === "all" ? colors.primary : colors.mutedForeground }]}>
                    All  {viewers.length > 0 && <Text style={styles.tabCount}>{viewers.length}</Text>}
                  </Text>
                </TouchableOpacity>
                {totalReactions > 0 && (
                  <TouchableOpacity
                    style={[styles.tab, tab === "reactions" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                    onPress={() => setTab("reactions")}
                  >
                    <Text style={[styles.tabText, { color: tab === "reactions" ? colors.primary : colors.mutedForeground }]}>
                      Reactions  <Text style={styles.tabCount}>{totalReactions}</Text>
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          }
          renderItem={({ item }) => <ViewerRow item={item} colors={colors} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="eye-off-outline" size={52} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {tab === "reactions" ? "No reactions yet" : "No views yet"}
              </Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                {tab === "all" ? "Your contacts who view this status will appear here" : "Tap the heart on your status to see reactions"}
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        />
      )}
    </View>
  );
}

function ViewerRow({ item, colors }: { item: Viewer; colors: any }) {
  const initials = (item.name ?? "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <View style={[styles.viewerRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.avatarWrap}>
        {item.avatar ? (
          <Image source={{ uri: item.avatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: `hsl(${item.name.charCodeAt(0) * 37 % 360},50%,45%)` }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
        {item.reaction && (
          <View style={[styles.reactionBadge, { backgroundColor: colors.background }]}>
            <Text style={styles.reactionBadgeText}>{item.reaction}</Text>
          </View>
        )}
      </View>
      <View style={styles.viewerInfo}>
        <Text style={[styles.viewerName, { color: colors.foreground }]}>{item.name}</Text>
        <Text style={[styles.viewerTime, { color: colors.mutedForeground }]}>
          {formatTime(new Date(item.viewed_at).getTime())}
        </Text>
      </View>
      {item.reaction && (
        <Text style={styles.reactionBig}>{item.reaction}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 12, gap: 4 },
  iconBtn: { padding: 8 },
  headerTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_600SemiBold", flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  // Stats
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 24, marginBottom: 2 },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statNumber: { fontSize: 28, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  statDivider: { width: 1, height: 50 },
  // Reaction breakdown
  reactionBreakdown: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20, paddingVertical: 14, marginBottom: 2 },
  reactionBreakdownChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24 },
  chipEmoji: { fontSize: 22 },
  chipCount: { fontSize: 15, fontFamily: "Inter_700Bold" },
  // Tabs
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabCount: { fontSize: 12 },
  // Viewer row
  viewerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  avatarWrap: { position: "relative" },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  reactionBadge: { position: "absolute", bottom: -2, right: -4, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  reactionBadgeText: { fontSize: 13 },
  viewerInfo: { flex: 1 },
  viewerName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  viewerTime: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  reactionBig: { fontSize: 26 },
  // Empty
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 40 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
});
