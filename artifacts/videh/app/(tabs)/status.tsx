import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
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
import { useApp, Status } from "@/context/AppContext";
import { formatTime } from "@/utils/time";

export default function StatusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { statuses, user } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const [fabOpen, setFabOpen] = useState(false);

  const myStatuses = statuses.filter((s) => s.userId === "me");
  const recentStatuses = statuses.filter((s) => s.userId !== "me" && !s.viewed);
  const viewedStatuses = statuses.filter((s) => s.userId !== "me" && s.viewed);

  const initials = (user?.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Text style={styles.headerTitle}>Status</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerBtn}>
            <Ionicons name="search-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn}>
            <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={[]}
        keyExtractor={(item) => item}
        renderItem={null}
        ListHeaderComponent={
          <View>
            {/* My Status */}
            <TouchableOpacity
              style={[styles.myStatus, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
              onPress={() => {
                if (myStatuses.length > 0) {
                  router.push({ pathname: "/status/view", params: { id: myStatuses[0].id } });
                } else {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push("/status/create");
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.myStatusLeft}>
                {/* Avatar with ring if has status */}
                <View style={[styles.avatarRingWrap, myStatuses.length > 0 && { borderColor: colors.primary, borderWidth: 2.5 }]}>
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
                      ? `${myStatuses.length} update${myStatuses.length > 1 ? "s" : ""} · ${formatTime(myStatuses[0].timestamp)}`
                      : "Tap to add status update"}
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
            {recentStatuses.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>RECENT UPDATES</Text>
                {recentStatuses.map((s) => (
                  <StatusRow key={s.id} status={s} colors={colors} onPress={() => router.push({ pathname: "/status/view", params: { id: s.id } })} />
                ))}
              </>
            )}

            {/* Viewed updates */}
            {viewedStatuses.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>VIEWED UPDATES</Text>
                {viewedStatuses.map((s) => (
                  <StatusRow key={s.id} status={s} colors={colors} onPress={() => router.push({ pathname: "/status/view", params: { id: s.id } })} />
                ))}
              </>
            )}

            {/* Empty state */}
            {recentStatuses.length === 0 && viewedStatuses.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="radio-button-on-outline" size={60} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No status updates yet</Text>
                <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                  Tap the pencil icon to create your first status
                </Text>
              </View>
            )}
          </View>
        }
        contentContainerStyle={{ paddingBottom: 120 }}
      />

      {/* FAB with expand */}
      {fabOpen && (
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setFabOpen(false)} />
      )}
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

function StatusRow({ status, colors, onPress }: { status: Status; colors: ReturnType<typeof useColors>; onPress: () => void }) {
  const initials = (status.userName ?? "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (status.userName ?? "A").charCodeAt(0) * 37 % 360;

  return (
    <TouchableOpacity
      style={[styles.statusRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.statusRing, { borderColor: status.viewed ? colors.mutedForeground : colors.primary }]}>
        {status.userAvatar ? (
          <Image source={{ uri: status.userAvatar }} style={styles.statusAvatarImg} contentFit="cover" />
        ) : (
          <View style={[styles.statusAvatarFallback, { backgroundColor: `hsl(${hue},50%,45%)` }]}>
            <Text style={styles.statusAvatarText}>{initials}</Text>
          </View>
        )}
      </View>
      <View style={styles.statusInfo}>
        <Text style={[styles.statusName, { color: colors.foreground }]}>{status.userName}</Text>
        <Text style={[styles.statusTime, { color: colors.mutedForeground }]}>{formatTime(status.timestamp)}</Text>
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
  statusInfo: {},
  statusName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  statusTime: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  empty: { alignItems: "center", marginTop: 60, paddingHorizontal: 40, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  fab: { position: "absolute", bottom: 90, right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5 },
  fabMenu: { position: "absolute", bottom: 162, right: 20, gap: 10 },
  fabMenuItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 28, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  fabMenuIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  fabMenuLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
