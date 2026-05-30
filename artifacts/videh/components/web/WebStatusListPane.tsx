import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp, type Status } from "@/context/AppContext";
import { formatTime } from "@/utils/time";
import { WEB_LIST_PANE_WIDTH } from "@/lib/web/webDesktop";
import { StoryRingAvatar } from "@/components/StoryRing";
import { getStatusRingSegments } from "@/lib/statusRingSegments";

type Props = { width?: number };

export function WebStatusListPane({ width = WEB_LIST_PANE_WIDTH }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { statuses, user } = useApp();

  const groups = useMemo(() => {
    const map: Record<string, Status[]> = {};
    statuses.filter((s) => s.userId !== "me").forEach((s) => {
      if (!map[s.userId]) map[s.userId] = [];
      map[s.userId].push(s);
    });
    return Object.values(map)
      .map((group) => {
        const sorted = [...group].sort((a, b) => a.timestamp - b.timestamp);
        const latest = sorted[sorted.length - 1];
        return {
          userId: group[0].userId,
          userName: group[0].userName,
          userAvatar: group[0].userAvatar,
          latestTime: latest.timestamp,
          hasUnviewed: group.some((s) => !s.viewed),
          statuses: sorted,
        };
      })
      .sort((a, b) => {
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        return b.latestTime - a.latestTime;
      });
  }, [statuses]);

  const openStatus = (userId: string, list: Status[]) => {
    router.push({
      pathname: "/status/view",
      params: { userId, index: "0", ids: list.map((s) => s.id).join(",") },
    } as never);
  };

  return (
    <View style={[styles.pane, { width, borderRightColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <Text style={styles.headerTitle}>Status</Text>
        <TouchableOpacity onPress={() => router.push("/status/create" as never)} hitSlop={8}>
          <Ionicons name="add-circle-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.myRow, { borderBottomColor: colors.border }]}
        onPress={() => router.push("/status/create" as never)}
        activeOpacity={0.8}
      >
        <View style={styles.myAvatarWrap}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarTxt}>{(user?.name ?? "?").slice(0, 1)}</Text>
            </View>
          )}
          <View style={[styles.plusBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={14} color="#fff" />
          </View>
        </View>
        <View>
          <Text style={[styles.myTitle, { color: colors.foreground }]}>My status</Text>
          <Text style={[styles.mySub, { color: colors.mutedForeground }]}>Click to add status update</Text>
        </View>
      </TouchableOpacity>
      <Text style={[styles.section, { color: colors.mutedForeground }]}>Recent updates</Text>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.userId}
        renderItem={({ item }) => {
          const segments = getStatusRingSegments(item.statuses);
          return (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => openStatus(item.userId, item.statuses)}
              activeOpacity={0.75}
            >
              <StoryRingAvatar segments={segments}>
                {item.userAvatar ? (
                  <Image source={{ uri: item.userAvatar }} style={styles.ringInner} contentFit="cover" />
                ) : (
                  <View style={[styles.ringInner, styles.avatarPh, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarTxt}>{item.userName.slice(0, 1)}</Text>
                  </View>
                )}
              </StoryRingAvatar>
              <View style={styles.rowBody}>
                <Text style={[styles.name, { color: colors.foreground }]}>{item.userName}</Text>
                <Text style={[styles.time, { color: colors.mutedForeground }]}>
                  {formatTime(item.latestTime)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: colors.mutedForeground }}>No status updates</Text>
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
  myRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  myAvatarWrap: { position: "relative" },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPh: { alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 18 },
  plusBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  myTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  mySub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  section: { fontSize: 13, fontFamily: "Inter_600SemiBold", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 14 },
  ringInner: { width: 48, height: 48, borderRadius: 24 },
  rowBody: { flex: 1 },
  name: { fontSize: 16, fontFamily: "Inter_500Medium" },
  time: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  empty: { padding: 32, alignItems: "center" },
});
