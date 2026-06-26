import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { ThemedHeader } from "@/components/ThemedHeader";
import { DropdownMenu } from "@/components/DropdownMenu";
import { filterCallLogs } from "@/lib/callLogFilter";
import { createCallLink } from "@/lib/callLinks";
import { interpolate } from "@/lib/i18n";

function formatCallTime(ts: number, yesterdayLabel: string): string {
  const now = Date.now();
  const diff = now - ts;
  const d = new Date(ts);
  if (diff < 24 * 3600000) {
    const h = d.getHours(), m = d.getMinutes().toString().padStart(2, "0");
    return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
  }
  if (diff < 2 * 24 * 3600000) return yesterdayLabel;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function CallsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { callLogs, clearCallLogs, user } = useApp();
  const { t } = useUiPreferences();
  const [tab, setTab] = useState<"all" | "missed">("all");
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const filtered = useMemo(
    () => filterCallLogs(callLogs, { tab, query: searchQuery }),
    [callLogs, tab, searchQuery],
  );

  const emptyMessage = useMemo(() => {
    const q = searchQuery.trim();
    if (q) return interpolate(t("calls.noSearchResults"), { query: q });
    if (tab === "missed") return t("calls.noMissed");
    return t("calls.noCalls");
  }, [searchQuery, tab, t]);

  const shareCallLink = async () => {
    const link = await createCallLink(user?.sessionToken, { type: "video", hoursValid: 48 });
    if (!link) {
      Alert.alert(t("common.error"), t("calls.linkFailed"));
      return;
    }
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    const url = link.webPath && domain
      ? `${domain.startsWith("http") ? domain : `https://${domain}`}${link.webPath}`
      : link.deepLink;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        Alert.alert(t("calls.linkCreated"), t("calls.linkCopied"));
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      await Share.share({ message: `Join my Videh call:\n${url}`, title: "Videh call link" });
    } catch {
      Alert.alert(t("calls.linkCreated"), url);
    }
  };

  const confirmClearLog = () => {
    Alert.alert(t("calls.menu.clearLog"), t("calls.menu.clearLogConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("calls.menu.clearLog"),
        style: "destructive",
        onPress: () => {
          void clearCallLogs();
        },
      },
    ]);
  };

  const menuItems = [
    { label: t("calls.menu.createLink"), icon: "link-outline", onPress: () => void shareCallLink() },
    { label: t("calls.menu.notifications"), icon: "notifications-outline", onPress: () => router.push("/settings/notifications") },
    { label: t("calls.menu.clearLog"), icon: "trash-outline", danger: true, onPress: confirmClearLog },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ThemedHeader style={[styles.header, { paddingTop: topPad }]}>
        {searching ? (
          <View style={styles.searchHeader}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => { setSearching(false); setSearchQuery(""); }}
            >
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <TextInput
              style={styles.searchInput}
              placeholder={t("calls.searchPlaceholder")}
              placeholderTextColor="rgba(255,255,255,0.65)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
        ) : (
          <>
            <Text style={styles.headerTitle}>{t("calls.title")}</Text>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSearching(true); }}
              >
                <Ionicons name="search-outline" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMenuOpen(true); }}
              >
                <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ThemedHeader>

      <DropdownMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} topOffset={topPad + 46} />

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(["all", "missed"] as const).map((tabId) => (
          <TouchableOpacity key={tabId} style={styles.tabBtn} onPress={() => setTab(tabId)}>
            <Text style={[styles.tabText, { color: tab === tabId ? colors.primary : colors.mutedForeground }]}>
              {tabId === "all" ? t("calls.tab.all") : t("calls.tab.missed")}
            </Text>
            {tab === tabId && <View style={[styles.tabLine, { backgroundColor: colors.primary }]} />}
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
          const isMissed =
            item.status !== "answered"
            && item.status !== "declined"
            && !(item.duration != null && item.duration > 0);
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
                    {formatCallTime(item.timestamp, t("common.yesterday"))}{durationStr}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => router.push({
                  pathname: "/call/[id]",
                  params: {
                    id: item.chatId ?? item.id,
                    name: item.name,
                    type: item.type,
                  },
                })}
              >
                <Ionicons name={item.type === "video" ? "videocam" : "call"} size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="call-outline" size={60} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{emptyMessage}</Text>
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
  searchHeader: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  searchInput: { flex: 1, color: "#fff", fontSize: 17, fontFamily: "Inter_400Regular", paddingVertical: 4 },
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
  empty: { alignItems: "center", marginTop: 80, gap: 12, paddingHorizontal: 24 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  fab: { position: "absolute", bottom: 90, right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5 },
});
