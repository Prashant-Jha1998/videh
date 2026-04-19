import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
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
import { useApp, Message } from "@/context/AppContext";
import { formatFullTime } from "@/utils/time";

export default function StarredScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { starredMessages, starMessage } = useApp();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const renderItem = ({ item }: { item: Message }) => (
    <View style={[styles.item, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <Ionicons name="star" size={16} color="#FFD700" style={styles.starIcon} />
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={[styles.chatName, { color: colors.primary }]}>{item.chatName ?? "Chat"}</Text>
          <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>{formatFullTime(item.timestamp)}</Text>
        </View>
        <Text style={[styles.msgText, { color: colors.foreground }]} numberOfLines={3}>{item.text}</Text>
        <Text style={[styles.sender, { color: colors.mutedForeground }]}>
          {item.senderId === "me" ? "You" : item.chatName}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => starMessage(item.chatId!, item.id)}
        style={styles.unstarBtn}
      >
        <Ionicons name="star" size={20} color="#FFD700" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Starred Messages</Text>
      </View>

      {starredMessages.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="star-outline" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Starred Messages</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Star important messages to find them quickly here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={starredMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingBottom: 14,
    gap: 8,
  },
  backBtn: { padding: 6 },
  headerTitle: { color: "#fff", fontSize: 19, fontFamily: "Inter_600SemiBold" },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  starIcon: { marginTop: 2 },
  itemContent: { flex: 1 },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  chatName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  timestamp: { fontSize: 11, fontFamily: "Inter_400Regular" },
  msgText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  sender: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  unstarBtn: { padding: 4, paddingLeft: 8 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
