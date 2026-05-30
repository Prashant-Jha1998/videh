import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp, type Chat } from "@/context/AppContext";
import { formatTime } from "@/utils/time";

type Props = {
  width: number;
  activeChatId?: string;
};

export function WebChatsSidebar({ width, activeChatId }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { chats } = useApp();
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    const visible = chats.filter((c) => !c.isArchived);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? visible.filter((c) => c.name.toLowerCase().includes(q) || (c.lastMessage ?? "").toLowerCase().includes(q))
      : visible;
    const pinned = filtered.filter((c) => c.isPinned);
    const rest = filtered.filter((c) => !c.isPinned);
    return [...pinned, ...rest];
  }, [chats, search]);

  const openChat = (chat: Chat) => {
    router.push({ pathname: "/chat/[id]", params: { id: chat.id, name: chat.name } });
  };

  return (
    <View style={[styles.sidebar, { width, borderRightColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <Text style={styles.headerTitle}>Videh</Text>
        <TouchableOpacity onPress={() => router.push("/contacts")} hitSlop={8}>
          <Ionicons name="person-add-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search or start new chat"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const active = item.id === activeChatId;
          const initials = item.name.slice(0, 2).toUpperCase();
          return (
            <TouchableOpacity
              style={[
                styles.row,
                { borderBottomColor: colors.border, backgroundColor: active ? colors.primary + "14" : "transparent" },
              ]}
              onPress={() => openChat(item)}
              activeOpacity={0.75}
            >
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  router.push({ pathname: "/chat-info/[id]", params: { id: item.id, name: item.name } });
                }}
                activeOpacity={0.8}
              >
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPh, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarTxt}>{initials}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.time, { color: colors.mutedForeground }]}>
                    {item.lastMessageTime ? formatTime(item.lastMessageTime) : ""}
                  </Text>
                </View>
                <Text style={[styles.preview, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.lastMessage || " "}
                </Text>
              </View>
              {item.unreadCount > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeTxt}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: colors.mutedForeground }}>No chats yet</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { borderRightWidth: StyleSheet.hairlineWidth, height: "100%" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 67,
  },
  headerTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_600SemiBold" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPh: { alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  name: { flex: 1, fontSize: 16, fontFamily: "Inter_500Medium" },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  preview: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeTxt: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { padding: 32, alignItems: "center" },
});
