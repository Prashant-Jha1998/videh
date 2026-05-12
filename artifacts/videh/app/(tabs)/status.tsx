import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { useApp, Status } from "@/context/AppContext";
import { formatTime } from "@/utils/time";
import { ThemedHeader } from "@/components/ThemedHeader";

interface StatusGroup {
  userId: string;
  userName: string;
  userAvatar?: string;
  statuses: Status[];
  latestTime: number;
  hasUnviewed: boolean;
  isBoosted: boolean;
}

export default function StatusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { statuses, user } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const [fabOpen, setFabOpen] = useState(false);

  const myStatuses = useMemo(
    () => statuses.filter((s) => s.userId === "me").sort((a, b) => a.timestamp - b.timestamp),
    [statuses]
  );

  // Group others' statuses by userId — each user gets one row
  const statusGroups = useMemo<StatusGroup[]>(() => {
    const map: Record<string, Status[]> = {};
    statuses
      .filter((s) => s.userId !== "me")
      .forEach((s) => {
        if (!map[s.userId]) map[s.userId] = [];
        map[s.userId].push(s);
      });
    return Object.values(map)
      .map((group) => {
        const sorted = [...group].sort((a, b) => a.timestamp - b.timestamp);
        return {
          userId: group[0].userId,
          userName: group[0].userName,
          userAvatar: group[0].userAvatar,
          statuses: sorted,
          latestTime: Math.max(...group.map((s) => s.timestamp)),
          hasUnviewed: group.some((s) => !s.viewed),
          isBoosted: group.some((s) => s.isBoosted),
        };
      })
      .sort((a, b) => {
        // Boosted stories get top placement while still keeping unread behavior.
        if (a.isBoosted && !b.isBoosted) return -1;
        if (!a.isBoosted && b.isBoosted) return 1;
        // Unviewed first, then by latest time
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        return b.latestTime - a.latestTime;
      });
  }, [statuses]);

  const recentGroups = statusGroups.filter((g) => g.hasUnviewed);
  const viewedGroups = statusGroups.filter((g) => !g.hasUnviewed);

  const initials = (user?.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const openMyStatus = () => {
    if (myStatuses.length > 0) {
      router.push("/status/my" as any);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push("/status/create");
    }
  };

  const openGroup = (group: StatusGroup) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: "/status/view", params: { ids: group.statuses.map((s) => s.id).join(",") } });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <ThemedHeader style={[styles.header, { paddingTop: topPad }]}>
        <Text style={styles.headerTitle}>Status</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerBtn}>
            <Ionicons name="search-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn}>
            <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </ThemedHeader>

      <FlatList
        data={[]}
        keyExtractor={(item) => item}
        renderItem={null}
        ListHeaderComponent={
          <View>
            {/* My Status */}
            <TouchableOpacity
              style={[styles.myStatus, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
              onPress={openMyStatus}
              activeOpacity={0.7}
            >
              <View style={styles.myStatusLeft}>
                <View style={[
                  styles.avatarRingWrap,
                  myStatuses.length > 0 && { borderColor: colors.primary, borderWidth: 2.5 }
                ]}>
                  {user?.avatar ? (
                    <Image source={{ uri: user.avatar }} style={styles.myAvatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.myAvatarFallback, { backgroundColor: colors.primary }]}>
                      <Text style={styles.myAvatarText}>{initials}</Text>
                    </View>
                  )}
                  {myStatuses.length === 0 && (
                    <View style={[styles.addBadge, { backgroundColor: colors.primary }]}>
                      <Ionicons name="add" size={13} color="#fff" />
                    </View>
                  )}
                </View>
                <View>
                  <Text style={[styles.myName, { color: colors.foreground }]}>My status</Text>
                  <Text style={[styles.myHint, { color: colors.mutedForeground }]}>
                    {myStatuses.length > 0
                      ? `${myStatuses.length} update${myStatuses.length > 1 ? "s" : ""} · ${formatTime(myStatuses[myStatuses.length - 1].timestamp)}`
                      : "Disappears after 24 hours"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/status/create?mode=camera"); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="camera-outline" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </TouchableOpacity>

            {/* Recent updates */}
            {recentGroups.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RECENT UPDATES</Text>
                {recentGroups.map((g) => (
                  <StatusGroupRow key={g.userId} group={g} colors={colors} onPress={() => openGroup(g)} />
                ))}
              </>
            )}

            {/* Viewed updates */}
            {viewedGroups.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>VIEWED UPDATES</Text>
                {viewedGroups.map((g) => (
                  <StatusGroupRow key={g.userId} group={g} colors={colors} onPress={() => openGroup(g)} />
                ))}
              </>
            )}

            {/* Empty state */}
            {statusGroups.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="radio-button-on-outline" size={60} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No status updates yet</Text>
                <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                  Status updates from your contacts will appear here
                </Text>
              </View>
            )}
          </View>
        }
        contentContainerStyle={{ paddingBottom: 120 }}
      />

      {/* FAB */}
      {fabOpen && <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setFabOpen(false)} />}
      {fabOpen && (
        <View style={styles.fabMenu}>
          <TouchableOpacity
            style={[styles.fabMenuItem, { backgroundColor: colors.card }]}
            onPress={() => { setFabOpen(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/status/create?mode=camera"); }}
          >
            <View style={[styles.fabMenuIcon, { backgroundColor: "#555" }]}>
              <Ionicons name="image-outline" size={20} color="#fff" />
            </View>
            <Text style={[styles.fabMenuLabel, { color: colors.foreground }]}>Photo or video</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fabMenuItem, { backgroundColor: colors.card }]}
            onPress={() => { setFabOpen(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push("/status/create"); }}
          >
            <View style={[styles.fabMenuIcon, { backgroundColor: colors.primary }]}>
              <Ionicons name="pencil" size={20} color="#fff" />
            </View>
            <Text style={[styles.fabMenuLabel, { color: colors.foreground }]}>Text</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setFabOpen((v) => !v); }}
        activeOpacity={0.8}
      >
        <Ionicons name={fabOpen ? "close" : "pencil"} size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function StatusGroupRow({ group, colors, onPress }: { group: StatusGroup; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  const initials = (group.userName ?? "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (group.userName ?? "A").charCodeAt(0) * 37 % 360;
  const count = group.statuses.length;
  const ringColor = group.hasUnviewed ? "#25D366" : "#94A3B8";

  return (
    <TouchableOpacity
      style={[styles.statusRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Ring with segments for multiple statuses */}
      <View style={[styles.statusRing, { borderColor: ringColor }]}>
        {group.userAvatar ? (
          <Image source={{ uri: group.userAvatar }} style={styles.statusAvatarImg} contentFit="cover" />
        ) : (
          <View style={[styles.statusAvatarFallback, { backgroundColor: `hsl(${hue},50%,45%)` }]}>
            <Text style={styles.statusAvatarText}>{initials}</Text>
          </View>
        )}
        {count > 1 && (
          <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.countBadgeText}>{count}</Text>
          </View>
        )}
      </View>
      <View style={styles.statusInfo}>
        <Text style={[styles.statusName, { color: colors.foreground }]}>{group.userName}</Text>
        <Text style={[styles.statusTime, { color: colors.mutedForeground }]}>
          {formatTime(group.latestTime)}
          {count > 1 ? ` · ${count} updates` : ""}
        </Text>
        {group.isBoosted && (
          <View style={styles.boostBadge}>
            <Ionicons name="flash" size={11} color="#111B21" />
            <Text style={styles.boostBadgeText}>Sponsored</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  headerRight: { flexDirection: "row" },
  headerBtn: { padding: 6 },
  myStatus: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 2 },
  myStatusLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarRingWrap: { width: 56, height: 56, borderRadius: 28, borderWidth: 0, padding: 2 },
  myAvatar: { width: 48, height: 48, borderRadius: 24 },
  myAvatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  myAvatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  addBadge: { position: "absolute", bottom: -1, right: -1, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  myName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  myHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionLabel: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  statusRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  statusRing: { width: 54, height: 54, borderRadius: 27, borderWidth: 2.5, padding: 2, alignItems: "center", justifyContent: "center" },
  statusAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  statusAvatarFallback: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  statusAvatarText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  countBadge: { position: "absolute", bottom: -2, right: -4, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  countBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  statusInfo: { flex: 1 },
  statusName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  statusTime: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  boostBadge: { marginTop: 5, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FACC15", borderRadius: 11, paddingHorizontal: 7, paddingVertical: 2 },
  boostBadgeText: { color: "#111B21", fontSize: 10, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", marginTop: 60, paddingHorizontal: 40, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  fab: { position: "absolute", bottom: 90, right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5 },
  fabMenu: { position: "absolute", bottom: 162, right: 20, gap: 10 },
  fabMenuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 28, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  fabMenuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  fabMenuLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
