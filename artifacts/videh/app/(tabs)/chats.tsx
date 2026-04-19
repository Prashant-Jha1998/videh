import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp, Chat } from "@/context/AppContext";
import { formatTime } from "@/utils/time";
import { DropdownMenu } from "@/components/DropdownMenu";

export default function ChatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chats, pinChat, muteChat, archiveChat, refreshChats } = useApp();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "unread" | "groups">("all");
  const [menuOpen, setMenuOpen] = useState(false);

  const filtered = chats.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    if (tab === "unread") return matchSearch && c.unreadCount > 0;
    if (tab === "groups") return matchSearch && c.isGroup;
    return matchSearch;
  });

  const pinned = filtered.filter((c) => c.isPinned);
  const unpinned = filtered.filter((c) => !c.isPinned);
  const sorted = [...pinned, ...unpinned];

  const openChat = (chat: Chat) => {
    router.push({ pathname: "/chat/[id]", params: { id: chat.id, name: chat.name } });
  };

  const longPressChat = (chat: Chat) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(chat.name, "Choose action", [
      { text: chat.isPinned ? "Unpin" : "Pin", onPress: () => pinChat(chat.id) },
      { text: chat.isMuted ? "Unmute" : "Mute", onPress: () => muteChat(chat.id) },
      { text: "Archive", style: "destructive", onPress: () => archiveChat(chat.id) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const menuItems = [
    { label: "New group", icon: "people-outline", onPress: () => router.push("/new-group") },
    { label: "New broadcast", icon: "radio-outline", onPress: () => Alert.alert("Broadcast", "Broadcast lists coming soon.") },
    { label: "Linked devices", icon: "phone-portrait-outline", onPress: () => Alert.alert("Linked Devices", "Use Videh on your computer. Coming soon.") },
    { label: "Starred messages", icon: "star-outline", onPress: () => router.push("/starred") },
    { label: "Read all", icon: "checkmark-done-outline", onPress: () => refreshChats() },
    { label: "Settings", icon: "settings-outline", onPress: () => router.push("/(tabs)/settings") },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <Text style={styles.headerTitle}>Videh</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push("/contacts")}>
            <Ionicons name="person-add-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMenuOpen(true); }}
          >
            <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* WhatsApp-style dropdown */}
      <DropdownMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={menuItems}
        topOffset={topPad + 46}
      />

      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="Search"
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(["all", "unread", "groups"] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={styles.tabBtn}>
            <Text style={[styles.tabText, { color: tab === t ? colors.primary : colors.mutedForeground }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
            {tab === t && <View style={[styles.tabLine, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatRow
            chat={item}
            colors={colors}
            onPress={() => openChat(item)}
            onLongPress={() => longPressChat(item)}
          />
        )}
        ListEmptyComponent={
          search ? (
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={60} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No results for "{search}"</Text>
            </View>
          ) : (
            <View style={styles.emptyFull}>
              <View style={[styles.emptyIconCircle, { backgroundColor: colors.primary + "18" }]}>
                <Ionicons name="chatbubbles-outline" size={56} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No chats yet</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                Start a conversation with your contacts.{"\n"}Your messages are end-to-end encrypted.
              </Text>
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/contacts")}
                activeOpacity={0.85}
              >
                <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                <Text style={styles.emptyBtnText}>Start a chat</Text>
              </TouchableOpacity>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        scrollEnabled
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/contacts")}
        activeOpacity={0.8}
      >
        <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function ChatRow({
  chat,
  colors,
  onPress,
  onLongPress,
}: {
  chat: Chat;
  colors: any;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const initials = chat.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = chat.name.charCodeAt(0) * 37 % 360;
  const avatarBg = `hsl(${hue},50%,45%)`;

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={[styles.avatarWrap, { backgroundColor: avatarBg }]}>
        {chat.avatar ? (
          <Image source={{ uri: chat.avatar }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={styles.avatarText}>{initials}</Text>
        )}
        {!chat.isGroup && chat.isOnline && (
          <View style={[styles.onlineDot, { backgroundColor: colors.onlineGreen }]} />
        )}
      </View>

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <View style={styles.nameRow}>
            {chat.isPinned && <Ionicons name="pin" size={12} color={colors.mutedForeground} style={{ marginRight: 4, transform: [{ rotate: "45deg" }] }} />}
            {chat.isMuted && <Ionicons name="volume-mute" size={12} color={colors.mutedForeground} style={{ marginRight: 4 }} />}
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{chat.name}</Text>
          </View>
          <Text style={[styles.time, { color: chat.unreadCount > 0 ? colors.primary : colors.mutedForeground }]}>
            {chat.lastMessageTime ? formatTime(chat.lastMessageTime) : ""}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.lastMsg, { color: colors.mutedForeground }]} numberOfLines={1}>
            {chat.lastMessage ?? "No messages yet"}
          </Text>
          {chat.unreadCount > 0 && !chat.isMuted && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{chat.unreadCount > 99 ? "99+" : chat.unreadCount}</Text>
            </View>
          )}
          {chat.unreadCount > 0 && chat.isMuted && (
            <View style={[styles.badge, { backgroundColor: colors.mutedForeground }]}>
              <Text style={styles.badgeText}>{chat.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  headerRight: { flexDirection: "row", gap: 4 },
  headerBtn: { padding: 6 },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginVertical: 8, borderRadius: 24, paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  tabs: { flexDirection: "row", borderBottomWidth: 0.5, marginHorizontal: 16 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabLine: { position: "absolute", bottom: 0, height: 2, width: "80%", borderRadius: 1 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  avatarWrap: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginRight: 12, position: "relative", overflow: "hidden" },
  avatarImg: { width: 52, height: 52 },
  avatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  onlineDot: { width: 14, height: 14, borderRadius: 7, position: "absolute", bottom: 1, right: 1, borderWidth: 2, borderColor: "#fff" },
  rowContent: { flex: 1 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  name: { fontSize: 16, fontFamily: "Inter_600SemiBold", flex: 1 },
  time: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lastMsg: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1, marginRight: 8 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", marginTop: 80, gap: 12, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyFull: { alignItems: "center", marginTop: 80, gap: 16, paddingHorizontal: 40 },
  emptyIconCircle: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyHint: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 21 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 50, marginTop: 4 },
  emptyBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fab: { position: "absolute", bottom: 90, right: 20, width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5 },
});
