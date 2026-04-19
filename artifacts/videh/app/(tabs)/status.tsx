import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
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
  const { statuses, user, addStatus } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const myStatus = statuses.find((s) => s.userId === "me");
  const recentStatuses = statuses.filter((s) => s.userId !== "me" && !s.viewed);
  const viewedStatuses = statuses.filter((s) => s.userId !== "me" && s.viewed);

  const promptAddStatus = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.prompt(
      "New Status",
      "What's on your mind?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Post",
          onPress: (text) => {
            if (text?.trim()) addStatus(text.trim(), "text");
          },
        },
      ],
      "plain-text",
      "",
      "default"
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
              style={[styles.myStatus, { borderBottomColor: colors.border }]}
              onPress={promptAddStatus}
              activeOpacity={0.7}
            >
              <View style={styles.myStatusLeft}>
                <View style={[styles.avatarWrap, myStatus ? styles.hasStatus : {}]}>
                  <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() ?? "?"}</Text>
                  </View>
                  {!myStatus && (
                    <View style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                      <Ionicons name="add" size={14} color="#fff" />
                    </View>
                  )}
                </View>
                <View>
                  <Text style={[styles.myName, { color: colors.foreground }]}>My status</Text>
                  <Text style={[styles.myHint, { color: colors.mutedForeground }]}>
                    {myStatus ? formatTime(myStatus.timestamp) : "Tap to add status update"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity>
                <Ionicons name="camera-outline" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </TouchableOpacity>

            {recentStatuses.length > 0 && (
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, borderBottomColor: colors.border }]}>
                RECENT UPDATES
              </Text>
            )}
            {recentStatuses.map((s) => (
              <StatusRow key={s.id} status={s} colors={colors} onPress={() => router.push({ pathname: "/status/view", params: { id: s.id } })} />
            ))}
            {viewedStatuses.length > 0 && (
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, borderBottomColor: colors.border }]}>
                VIEWED UPDATES
              </Text>
            )}
            {viewedStatuses.map((s) => (
              <StatusRow key={s.id} status={s} colors={colors} onPress={() => router.push({ pathname: "/status/view", params: { id: s.id } })} />
            ))}
            {recentStatuses.length === 0 && viewedStatuses.length === 0 && (
              <View style={styles.empty}>
                <Ionicons name="radio-button-on-outline" size={60} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No status updates yet
                </Text>
                <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                  Tap the pencil icon to create your first status
                </Text>
              </View>
            )}
          </View>
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={promptAddStatus}
        activeOpacity={0.8}
      >
        <Ionicons name="pencil" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function StatusRow({ status, colors, onPress }: { status: Status; colors: any; onPress: () => void }) {
  const initials = status.userName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = status.userName.charCodeAt(0) * 37 % 360;
  const avatarBg = `hsl(${hue},50%,45%)`;

  return (
    <TouchableOpacity
      style={[styles.statusRow, { borderBottomColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.statusRing, { borderColor: status.viewed ? colors.mutedForeground : colors.statusRing }]}>
        <View style={[styles.statusAvatar, { backgroundColor: avatarBg }]}>
          <Text style={styles.statusAvatarText}>{initials}</Text>
        </View>
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
  myStatus: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  myStatusLeft: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarWrap: { position: "relative" },
  hasStatus: { borderWidth: 2, borderColor: "#25D366", borderRadius: 28 },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  addBtn: { position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  myName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  myHint: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  sectionLabel: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 12, fontFamily: "Inter_600SemiBold", borderBottomWidth: 0.5 },
  statusRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, gap: 14 },
  statusRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 2.5, alignItems: "center", justifyContent: "center", padding: 2 },
  statusAvatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  statusAvatarText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  statusInfo: {},
  statusName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  statusTime: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  empty: { alignItems: "center", marginTop: 60, paddingHorizontal: 40, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  fab: { position: "absolute", bottom: 90, right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5 },
});
