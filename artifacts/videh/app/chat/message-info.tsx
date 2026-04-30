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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { formatTime } from "@/utils/time";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();

type Receipt = {
  user_id: number;
  name: string;
  avatar_url?: string;
  status: "sent" | "delivered" | "read";
  updated_at: string;
};

export default function MessageInfoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chatId, messageId } = useLocalSearchParams<{ chatId: string; messageId: string }>();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chatId || !messageId) return;
    fetch(`${BASE_URL}/api/chats/${chatId}/messages/${messageId}/info`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setReceipts(d.receipts ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chatId, messageId]);

  const read = receipts.filter((r) => r.status === "read");
  const delivered = receipts.filter((r) => r.status === "delivered");
  const sent = receipts.filter((r) => r.status === "sent");

  const renderSection = (title: string, icon: string, color: string, items: Receipt[]) => {
    if (items.length === 0) return null;
    return (
      <>
        <View style={[styles.sectionHeader, { backgroundColor: colors.muted }]}>
          <Ionicons name={icon as any} size={16} color={color} />
          <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
          <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>{items.length}</Text>
        </View>
        {items.map((item) => {
          const initials = (item.name ?? "?").slice(0, 2).toUpperCase();
          const hue = ((item.name ?? "?").charCodeAt(0) * 37) % 360;
          return (
            <View key={item.user_id} style={[styles.row, { borderBottomColor: colors.border }]}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, { backgroundColor: `hsl(${hue},50%,45%)` }]}>
                  <Text style={styles.initials}>{initials}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
              </View>
              <Text style={[styles.time, { color: colors.mutedForeground }]}>
                {formatTime(new Date(item.updated_at).getTime())}
              </Text>
            </View>
          );
        })}
      </>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Ionicons name="arrow-back" size={22} color="#fff" onPress={() => router.back()} style={{ padding: 8 }} />
        <Text style={styles.headerTitle}>Message info</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : receipts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="information-circle-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No delivery info yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={[]}
          renderItem={null}
          ListHeaderComponent={
            <>
              {renderSection("Read", "checkmark-done", "#4FC3F7", read)}
              {renderSection("Delivered", "checkmark-done", "#888", delivered)}
              {renderSection("Sent", "checkmark", "#888", sent)}
            </>
          }
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
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 12,
    backgroundColor: "#00A884",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
    marginLeft: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  sectionCount: { fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  time: { fontSize: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 15 },
});
