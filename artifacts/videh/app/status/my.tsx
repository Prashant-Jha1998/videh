import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
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
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp, type Status } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

export default function MyStatusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { statuses, deleteStatus } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const myStatuses = useMemo(
    () => statuses.filter((s) => s.userId === "me").sort((a, b) => b.timestamp - a.timestamp),
    [statuses]
  );

  const shareStatus = async (status: Status, channelLabel?: string) => {
    const text = status.content?.trim() || "Shared from my Videh status";
    const payload = status.mediaUrl
      ? { message: channelLabel ? `${channelLabel}\n${text}` : text, url: status.mediaUrl }
      : { message: channelLabel ? `${channelLabel}\n${text}` : text };
    await Share.share(payload).catch(() => {});
  };

  const openMenu = (status: Status) => {
    Alert.alert("Status options", "Choose action", [
      { text: "Forward", onPress: () => { void shareStatus(status, "Forwarded status"); } },
      { text: "Save", onPress: () => { void shareStatus(status, "Save this status"); } },
      { text: "Share...", onPress: () => { void shareStatus(status); } },
      { text: "Share to Facebook", onPress: () => { void shareStatus(status, "Facebook"); } },
      { text: "Share to Instagram", onPress: () => { void shareStatus(status, "Instagram"); } },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyId(status.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await deleteStatus(status.id);
          setBusyId(null);
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>My status</Text>
      </View>

      <FlatList
        data={myStatuses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
              onPress={() => router.push({ pathname: "/status/view", params: { ids: myStatuses.map((s) => s.id).join(","), id: item.id } })}
            >
              {item.mediaUrl ? (
                <Image source={{ uri: item.mediaUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.textThumb]}>
                  <Ionicons name="document-text-outline" size={20} color="#fff" />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {item.content || (item.type === "video" ? "Video status" : item.type === "image" ? "Photo status" : "Text status")}
                </Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                  {new Date(item.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuBtn} onPress={() => openMenu(item)} disabled={busyId === item.id}>
              <Ionicons name="ellipsis-vertical" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="radio-button-on-outline" size={56} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No status updates yet</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 10, paddingBottom: 10 },
  headerBtn: { padding: 8 },
  headerTitle: { fontSize: 30, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: "#0f172a" },
  textThumb: { alignItems: "center", justifyContent: "center", backgroundColor: "#00A884" },
  rowTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  menuBtn: { padding: 8 },
  empty: { alignItems: "center", paddingTop: 70, gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_500Medium" },
});
