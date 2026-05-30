import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useApp, type Chat } from "@/context/AppContext";
import { formatTime } from "@/utils/time";
import { WebFilterChips } from "@/components/web/WebFilterChips";
import { inferChatListPreview } from "@/lib/normalizeMessage";

const FAVORITES_KEY = "videh_favorite_chat_ids";

type Props = {
  width: number;
  activeChatId?: string;
  archivedOnly?: boolean;
};

export function WebChatsSidebar({ width, activeChatId, archivedOnly }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { chats, user, markAllAsRead, logout } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(FAVORITES_KEY).then((raw) => {
      if (raw) {
        try {
          setFavoriteIds(JSON.parse(raw) as string[]);
        } catch {
          setFavoriteIds([]);
        }
      }
    });
  }, []);

  const unreadTotal = useMemo(
    () => chats.filter((c) => !c.isArchived).reduce((n, c) => n + c.unreadCount, 0),
    [chats],
  );

  const sorted = useMemo(() => {
    const base = archivedOnly ? chats.filter((c) => c.isArchived) : chats.filter((c) => !c.isArchived);
    const q = search.trim().toLowerCase();
    let filtered = q
      ? base.filter((c) => c.name.toLowerCase().includes(q) || (c.lastMessage ?? "").toLowerCase().includes(q))
      : base;
    if (filter === "unread") filtered = filtered.filter((c) => c.unreadCount > 0);
    if (filter === "favorites") filtered = filtered.filter((c) => favoriteIds.includes(c.id));
    const pinned = filtered.filter((c) => c.isPinned);
    const rest = filtered.filter((c) => !c.isPinned);
    return [...pinned, ...rest];
  }, [chats, search, filter, favoriteIds, archivedOnly]);

  const archivedCount = chats.filter((c) => c.isArchived).length;

  const openChat = (chat: Chat) => {
    router.push({ pathname: "/chat/[id]", params: { id: chat.id, name: chat.name } });
  };

  const previewFor = useCallback((chat: Chat) => {
    const last = chat.messages[chat.messages.length - 1];
    if (last) {
      return inferChatListPreview(last.type, last.text, last.mediaUrl);
    }
    return chat.lastMessage ?? "";
  }, []);

  const headerTitle = archivedOnly ? "Archived" : "Chats";

  return (
    <View style={[styles.sidebar, { width, borderRightColor: colors.border, backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity onPress={() => router.push("/(tabs)/settings")} activeOpacity={0.8}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarPh, { backgroundColor: "rgba(255,255,255,0.3)" }]}>
              <Text style={styles.headerAvatarTxt}>{(user?.name ?? "?").slice(0, 1)}</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push("/contacts")} hitSlop={8}>
            <Ionicons name="create-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {!archivedOnly ? (
        <WebFilterChips
          chips={[
            { id: "all", label: "All" },
            { id: "unread", label: "Unread", count: unreadTotal },
            { id: "favorites", label: "Favourites" },
          ]}
          activeId={filter}
          onChange={setFilter}
        />
      ) : (
        <Text style={[styles.archivedHint, { color: colors.mutedForeground }]}>
          These chats stay archived when new messages arrive.
        </Text>
      )}

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

      {!archivedOnly && archivedCount > 0 ? (
        <TouchableOpacity
          style={[styles.archivedRow, { borderBottomColor: colors.border }]}
          onPress={() => router.push("/(tabs)/chats?archived=1" as never)}
        >
          <Ionicons name="archive-outline" size={20} color={colors.mutedForeground} />
          <Text style={[styles.archivedTxt, { color: colors.foreground }]}>Archived</Text>
          <Text style={[styles.archivedCount, { color: colors.primary }]}>{archivedCount}</Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const active = item.id === activeChatId;
          const initials = item.name.slice(0, 2).toUpperCase();
          const preview = previewFor(item);
          return (
            <TouchableOpacity
              style={[
                styles.row,
                { borderBottomColor: colors.border, backgroundColor: active ? colors.primary + "14" : "transparent" },
              ]}
              onPress={() => openChat(item)}
              activeOpacity={0.75}
            >
              {item.avatar ? (
                <Image source={{ uri: item.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPh, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarTxt}>{initials}</Text>
                </View>
              )}
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.time, { color: item.unreadCount ? colors.primary : colors.mutedForeground }]}>
                    {item.lastMessageTime ? formatTime(item.lastMessageTime) : ""}
                  </Text>
                </View>
                <Text style={[styles.preview, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {preview || " "}
                </Text>
              </View>
              {item.unreadCount > 0 && !item.isMuted ? (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.badgeTxt}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: colors.mutedForeground }}>
              {archivedOnly ? "No archived chats" : "No chats yet"}
            </Text>
          </View>
        }
      />

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menuSheet, { backgroundColor: colors.card }]}>
            {[
              { icon: "people-outline", label: "New group", onPress: () => router.push("/new-group") },
              { icon: "star-outline", label: "Starred messages", onPress: () => router.push("/starred") },
              { icon: "checkmark-done-outline", label: "Mark all as read", onPress: () => void markAllAsRead() },
              { icon: "log-out-outline", label: "Log out", onPress: () => Alert.alert("Log out", "Log out of Videh Web?", [{ text: "Cancel" }, { text: "Log out", style: "destructive", onPress: () => void logout() }]) },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                style={[styles.menuRow, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setMenuOpen(false);
                  item.onPress();
                }}
              >
                <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={20} color={colors.foreground} />
                <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: { borderRightWidth: StyleSheet.hairlineWidth, height: "100%" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingTop: 16,
    gap: 12,
  },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarPh: { alignItems: "center", justifyContent: "center" },
  headerAvatarTxt: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 20, fontFamily: "Inter_600SemiBold" },
  headerActions: { flexDirection: "row", gap: 8 },
  archivedHint: { fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 16, paddingBottom: 8, lineHeight: 17 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 8, fontFamily: "Inter_400Regular" },
  archivedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  archivedTxt: { flex: 1, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  archivedCount: { fontSize: 13, fontFamily: "Inter_700Bold" },
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
  badgeTxt: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  empty: { padding: 32, alignItems: "center" },
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 56, paddingRight: 12 },
  menuSheet: { borderRadius: 8, minWidth: 220, overflow: "hidden", elevation: 8 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  menuLabel: { fontSize: 15, fontFamily: "Inter_400Regular" },
});
