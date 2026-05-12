import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp, Chat, type Status } from "@/context/AppContext";
import { formatTime } from "@/utils/time";
import { DropdownMenu } from "@/components/DropdownMenu";
import { ThemedHeader } from "@/components/ThemedHeader";
import { safeJsonArray } from "@/lib/safeJson";

/** Status ring for 1:1 chats: green if any update unseen, grey if all seen (like WhatsApp). */
function getContactStatusRingState(chat: Chat, statuses: Status[]): { count: number; hasUnviewed: boolean } | null {
  if (chat.isGroup || chat.otherUserId == null) return null;
  const uid = String(chat.otherUserId);
  const theirs = statuses.filter((s) => s.userId === uid);
  if (theirs.length === 0) return null;
  return {
    count: theirs.length,
    hasUnviewed: theirs.some((s) => !s.viewed),
  };
}

const FAVORITES_KEY = "videh_favorite_chat_ids";
const HIDDEN_CHATS_KEY = "videh_hidden_chat_ids";
const MANUAL_UNREAD_KEY = "videh_manual_unread_chat_ids";
const LOCKED_CHATS_KEY = "videh_locked_chat_ids";
const CHAT_SHORTCUTS_KEY = "videh_chat_shortcut_ids";
const CUSTOM_LIST_KEY = "videh_custom_list_chat_ids";

export default function ChatsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { chats, pinChat, muteChat, archiveChat, refreshChats, blockUser, markAsRead } = useApp();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "unread" | "favorites" | "groups">("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const [previewChat, setPreviewChat] = useState<Chat | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [manualUnreadIds, setManualUnreadIds] = useState<string[]>([]);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [shortcutIds, setShortcutIds] = useState<string[]>([]);
  const [customListIds, setCustomListIds] = useState<string[]>([]);

  const selectedChats = chats.filter((c) => selectedIds.includes(c.id));
  const isSelectionMode = selectedIds.length > 0;
  const visibleBase = chats.filter((c) => !hiddenIds.includes(c.id));
  const archivedChats = visibleBase.filter((c) => c.isArchived);
  const visibleChats = showArchived ? archivedChats : visibleBase.filter((c) => !c.isArchived);
  const getUnreadCount = (chat: Chat) => manualUnreadIds.includes(chat.id) ? Math.max(chat.unreadCount, 1) : chat.unreadCount;
  const filtered = visibleChats.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    if (tab === "unread") return matchSearch && getUnreadCount(c) > 0;
    if (tab === "favorites") return matchSearch && favoriteIds.includes(c.id);
    if (tab === "groups") return matchSearch && c.isGroup;
    return matchSearch;
  });

  const pinned = filtered.filter((c) => c.isPinned);
  const unpinned = filtered.filter((c) => !c.isPinned);
  const sorted = [...pinned, ...unpinned];

  useEffect(() => {
    AsyncStorage.multiGet([
      FAVORITES_KEY,
      HIDDEN_CHATS_KEY,
      MANUAL_UNREAD_KEY,
      LOCKED_CHATS_KEY,
      CHAT_SHORTCUTS_KEY,
      CUSTOM_LIST_KEY,
    ]).then((rows) => {
      const favRaw = rows.find(([key]) => key === FAVORITES_KEY)?.[1];
      const hiddenRaw = rows.find(([key]) => key === HIDDEN_CHATS_KEY)?.[1];
      const unreadRaw = rows.find(([key]) => key === MANUAL_UNREAD_KEY)?.[1];
      const lockedRaw = rows.find(([key]) => key === LOCKED_CHATS_KEY)?.[1];
      const shortcutRaw = rows.find(([key]) => key === CHAT_SHORTCUTS_KEY)?.[1];
      const listRaw = rows.find(([key]) => key === CUSTOM_LIST_KEY)?.[1];
      setFavoriteIds(safeJsonArray(favRaw));
      setHiddenIds(safeJsonArray(hiddenRaw));
      setManualUnreadIds(safeJsonArray(unreadRaw));
      setLockedIds(safeJsonArray(lockedRaw));
      setShortcutIds(safeJsonArray(shortcutRaw));
      setCustomListIds(safeJsonArray(listRaw));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedIds.length === 0) setSelectionMenuOpen(false);
  }, [selectedIds.length]);

  const openChat = (chat: Chat) => {
    if (isSelectionMode) {
      toggleSelect(chat.id);
      return;
    }
    if (lockedIds.includes(chat.id)) {
      Alert.alert("Locked chat", "Unlock this chat to open it.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unlock and open",
          onPress: () => {
            const next = lockedIds.filter((id) => id !== chat.id);
            setLockedIds(next);
            AsyncStorage.setItem(LOCKED_CHATS_KEY, JSON.stringify(next)).catch(() => {});
            setManualUnreadIds((prev) => {
              const updated = prev.filter((id) => id !== chat.id);
              AsyncStorage.setItem(MANUAL_UNREAD_KEY, JSON.stringify(updated)).catch(() => {});
              return updated;
            });
            markAsRead(chat.id);
            router.push({ pathname: "/chat/[id]", params: { id: chat.id, name: chat.name } });
          },
        },
      ]);
      return;
    }
    setManualUnreadIds((prev) => {
      const next = prev.filter((id) => id !== chat.id);
      if (next.length !== prev.length) AsyncStorage.setItem(MANUAL_UNREAD_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    router.push({ pathname: "/chat/[id]", params: { id: chat.id, name: chat.name } });
  };

  const toggleSelect = (chatId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId]);
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setSelectionMenuOpen(false);
  };

  const persistFavoriteIds = (next: string[]) => {
    setFavoriteIds(next);
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)).catch(() => {});
  };

  const persistIds = (key: string, setter: (ids: string[]) => void, next: string[]) => {
    setter(next);
    AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
  };

  const toggleFavoriteSelected = () => {
    if (selectedIds.length === 0) return;
    const allFavorite = selectedIds.every((id) => favoriteIds.includes(id));
    const next = allFavorite
      ? favoriteIds.filter((id) => !selectedIds.includes(id))
      : Array.from(new Set([...favoriteIds, ...selectedIds]));
    persistFavoriteIds(next);
    clearSelection();
  };

  const longPressChat = (chat: Chat) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedIds((prev) => prev.includes(chat.id) ? prev : [...prev, chat.id]);
  };

  const applyBulkPin = () => {
    const shouldPin = selectedChats.some((c) => !c.isPinned);
    selectedChats.forEach((chat) => {
      if (Boolean(chat.isPinned) !== shouldPin) pinChat(chat.id);
    });
    clearSelection();
  };

  const applyBulkMute = () => {
    const shouldMute = selectedChats.some((c) => !c.isMuted);
    selectedChats.forEach((chat) => {
      if (Boolean(chat.isMuted) !== shouldMute) muteChat(chat.id);
    });
    clearSelection();
  };

  const applyBulkArchive = () => {
    const shouldArchive = selectedChats.some((c) => !c.isArchived);
    selectedChats.forEach((chat) => archiveChat(chat.id, shouldArchive));
    if (shouldArchive) setShowArchived(false);
    clearSelection();
  };

  const deleteSelectedFromList = () => {
    if (selectedIds.length === 0) return;
    Alert.alert(
      "Delete chats?",
      "Selected chats will be hidden from this chat list on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const next = Array.from(new Set([...hiddenIds, ...selectedIds]));
            setHiddenIds(next);
            AsyncStorage.setItem(HIDDEN_CHATS_KEY, JSON.stringify(next)).catch(() => {});
            clearSelection();
          },
        },
      ],
    );
  };

  const addShortcutSelected = () => {
    const next = Array.from(new Set([...shortcutIds, ...selectedIds]));
    persistIds(CHAT_SHORTCUTS_KEY, setShortcutIds, next);
    selectedChats.forEach((chat) => {
      if (!chat.isPinned) pinChat(chat.id);
    });
    Alert.alert("Shortcut added", "Selected chats are marked as shortcuts and pinned at the top.");
    clearSelection();
  };

  const viewSelectedContact = () => {
    const only = selectedChats[0];
    clearSelection();
    if (only) openChatInfo(only);
  };

  const markSelectedUnread = () => {
    const next = Array.from(new Set([...manualUnreadIds, ...selectedIds]));
    persistIds(MANUAL_UNREAD_KEY, setManualUnreadIds, next);
    clearSelection();
  };

  const selectAllVisible = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds(sorted.map((chat) => chat.id));
    setSelectionMenuOpen(false);
  };

  const toggleLockSelected = () => {
    const allLocked = selectedIds.every((id) => lockedIds.includes(id));
    const next = allLocked
      ? lockedIds.filter((id) => !selectedIds.includes(id))
      : Array.from(new Set([...lockedIds, ...selectedIds]));
    persistIds(LOCKED_CHATS_KEY, setLockedIds, next);
    clearSelection();
  };

  const addToListSelected = () => {
    const next = Array.from(new Set([...customListIds, ...selectedIds]));
    persistIds(CUSTOM_LIST_KEY, setCustomListIds, next);
    Alert.alert("Added to list", "Selected chats were added to your saved chat list.");
    clearSelection();
  };

  const clearSelectedChats = () => {
    Alert.alert("Clear chat?", "This clears the selected chats from your chat list on this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => {
        const next = Array.from(new Set([...hiddenIds, ...selectedIds]));
        setHiddenIds(next);
        AsyncStorage.setItem(HIDDEN_CHATS_KEY, JSON.stringify(next)).catch(() => {});
        clearSelection();
      } },
    ]);
  };

  const blockSelectedChats = () => {
    const directChats = selectedChats.filter((chat) => !chat.isGroup && chat.otherUserId);
    if (directChats.length === 0) {
      Alert.alert("Cannot block", "Select a direct contact chat to block.");
      return;
    }
    Alert.alert("Block contacts?", "Selected contacts will no longer be able to call or message you.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: () => {
          directChats.forEach((chat) => {
            if (chat.otherUserId) blockUser(chat.otherUserId).catch(() => {});
          });
          clearSelection();
        },
      },
    ]);
  };

  const openChatInfo = (chat: Chat) => {
    router.push({ pathname: "/chat-info/[id]", params: { id: chat.id } });
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const menuItems = [
    { label: "New group", icon: "people-outline", onPress: () => router.push("/new-group") },
    { label: "New broadcast", icon: "radio-outline", onPress: () => router.push("/broadcasts") },
    { label: "Linked devices", icon: "phone-portrait-outline", onPress: () => router.push("/linked-devices") },
    { label: "Starred messages", icon: "star-outline", onPress: () => router.push("/starred") },
    { label: "Read all", icon: "checkmark-done-outline", onPress: () => refreshChats() },
    { label: "Settings", icon: "settings-outline", onPress: () => router.push("/(tabs)/settings") },
  ];

  const selectionMenuItems = [
    { label: "Add chat shortcut", icon: "apps-outline", onPress: addShortcutSelected },
    { label: selectedIds.length === 1 ? "View contact" : "View info", icon: "person-circle-outline", onPress: viewSelectedContact },
    { label: "Mark as unread", icon: "mail-unread-outline", onPress: markSelectedUnread },
    { label: "Select all", icon: "checkbox-outline", onPress: selectAllVisible },
    { label: selectedIds.every((id) => lockedIds.includes(id)) ? "Unlock chat" : "Lock chat", icon: "lock-closed-outline", onPress: toggleLockSelected },
    { label: selectedChats.every((c) => favoriteIds.includes(c.id)) ? "Remove from Favourites" : "Add to Favourites", icon: "heart-outline", onPress: toggleFavoriteSelected },
    { label: "Add to list", icon: "list-outline", onPress: addToListSelected },
    { label: "Clear chat", icon: "close-circle-outline", onPress: clearSelectedChats },
    { label: "Block", icon: "ban-outline", onPress: blockSelectedChats },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <ThemedHeader style={[styles.header, { paddingTop: topPad }]}>
        {isSelectionMode ? (
          <View style={styles.selectionHeaderLeft}>
            <TouchableOpacity onPress={clearSelection} style={styles.archivedBackBtn}>
              <Ionicons name="arrow-back" size={23} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{selectedIds.length}</Text>
          </View>
        ) : showArchived ? (
          <View style={styles.archivedHeaderTitleRow}>
            <TouchableOpacity onPress={() => setShowArchived(false)} style={styles.archivedBackBtn}>
              <Ionicons name="arrow-back" size={23} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Archived</Text>
          </View>
        ) : (
          <Text style={styles.headerTitle}>Videh</Text>
        )}
        <View style={styles.headerRight}>
          {isSelectionMode ? (
            <>
              <TouchableOpacity style={styles.headerBtn} onPress={applyBulkPin}>
                <Ionicons name="pin-outline" size={21} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={deleteSelectedFromList}>
                <Ionicons name="trash-outline" size={21} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={applyBulkMute}>
                <Ionicons name={selectedChats.every((c) => c.isMuted) ? "notifications-outline" : "notifications-off-outline"} size={21} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={applyBulkArchive}>
                <Ionicons name={selectedChats.every((c) => c.isArchived) ? "archive" : "archive-outline"} size={21} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={() => setSelectionMenuOpen(true)}>
                <Ionicons name="ellipsis-vertical" size={21} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.headerBtn} onPress={() => router.push("/contacts")}>
                <Ionicons name="person-add-outline" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMenuOpen(true); }}
              >
                <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </ThemedHeader>

      {/* WhatsApp-style dropdown */}
      <DropdownMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={menuItems}
        topOffset={topPad + 46}
      />
      <DropdownMenu
        visible={selectionMenuOpen}
        onClose={() => setSelectionMenuOpen(false)}
        items={selectionMenuItems}
        topOffset={topPad + 46}
      />

      {/* Search */}
      {!showArchived && !isSelectionMode && archivedChats.length > 0 ? (
        <TouchableOpacity
          style={[styles.archivedRow, { borderBottomColor: colors.border }]}
          onPress={() => setShowArchived(true)}
          activeOpacity={0.82}
        >
          <View style={styles.archivedRowLeft}>
            <Ionicons name="archive-outline" size={22} color={colors.primary} />
            <Text style={[styles.archivedRowText, { color: colors.foreground }]}>Archived</Text>
          </View>
          <Text style={[styles.archivedCount, { color: colors.primary }]}>{archivedChats.length}</Text>
        </TouchableOpacity>
      ) : null}

      {!isSelectionMode ? <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
      </View> : null}

      {/* Filter tabs */}
      {!isSelectionMode ? <View style={styles.filterChips}>
        {([
          { id: "all", label: "All" },
          { id: "unread", label: `Unread ${visibleBase.reduce((acc, c) => acc + (getUnreadCount(c) > 0 ? 1 : 0), 0)}` },
          { id: "favorites", label: "Favorites" },
          { id: "groups", label: "Groups" },
        ] as const).map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[
              styles.filterChip,
              {
                backgroundColor: tab === t.id ? colors.primary + "20" : colors.card,
                borderColor: tab === t.id ? colors.primary + "55" : colors.border,
              },
            ]}
          >
            <Text style={[styles.filterChipText, { color: tab === t.id ? colors.primary : colors.mutedForeground }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.filterChipPlus, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => Alert.alert("Custom filters", "Favorites, Unread and Groups filters are ready. More filters can be added later.")}
        >
          <Ionicons name="add" size={17} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View> : null}

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatRow
            chat={item}
            colors={colors}
            onPress={() => openChat(item)}
            onLongPress={() => longPressChat(item)}
            onAvatarPress={() => isSelectionMode ? toggleSelect(item.id) : setPreviewChat(item)}
            selected={selectedIds.includes(item.id)}
            isFavorite={favoriteIds.includes(item.id)}
            isLocked={lockedIds.includes(item.id)}
            isShortcut={shortcutIds.includes(item.id)}
            unreadCount={getUnreadCount(item)}
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
                <Ionicons name={showArchived ? "archive-outline" : "chatbubbles-outline"} size={56} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{showArchived ? "No archived chats" : "No chats yet"}</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                {showArchived
                  ? "Archived chats will appear here."
                  : "Start a conversation with your contacts.\nYour messages are end-to-end encrypted."}
              </Text>
              {!showArchived ? (
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push("/contacts")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                  <Text style={styles.emptyBtnText}>Start a chat</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        scrollEnabled
      />

      {/* FAB */}
      {!isSelectionMode ? <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/contacts")}
        activeOpacity={0.8}
      >
        <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
      </TouchableOpacity> : null}

      <Modal visible={!!previewChat} transparent animationType="fade" onRequestClose={() => setPreviewChat(null)}>
        <View style={styles.previewOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setPreviewChat(null)} />
          {previewChat ? (
            <View style={[styles.previewCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.previewName, { color: colors.foreground }]} numberOfLines={1}>
                {previewChat.name}
              </Text>
              {previewChat.avatar ? (
                <Image source={{ uri: previewChat.avatar }} style={styles.previewImage} contentFit="cover" />
              ) : (
                <View style={[styles.previewFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.previewFallbackText}>
                    {previewChat.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                  </Text>
                </View>
              )}
              <View style={[styles.previewActions, { borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.previewActionBtn}
                  onPress={() => {
                    const chat = previewChat;
                    setPreviewChat(null);
                    openChat(chat);
                  }}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.previewActionBtn}
                  onPress={() => {
                    const chat = previewChat;
                    setPreviewChat(null);
                    openChatInfo(chat);
                  }}
                >
                  <Ionicons name="information-circle-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function ChatRow({
  chat,
  colors,
  onPress,
  onLongPress,
  onAvatarPress,
  selected,
  isFavorite,
  isLocked,
  isShortcut,
  unreadCount,
}: {
  chat: Chat;
  colors: any;
  onPress: () => void;
  onLongPress: () => void;
  onAvatarPress: () => void;
  selected: boolean;
  isFavorite: boolean;
  isLocked: boolean;
  isShortcut: boolean;
  unreadCount: number;
}) {
  const { statuses } = useApp();
  const initials = chat.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = chat.name.charCodeAt(0) * 37 % 360;
  const avatarBg = `hsl(${hue},50%,45%)`;
  const statusRing = useMemo(() => getContactStatusRingState(chat, statuses), [chat, statuses]);

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }, selected && { backgroundColor: colors.primary + "14" }]}>
      <TouchableOpacity
        style={styles.avatarTapArea}
        onPress={onAvatarPress}
        activeOpacity={0.85}
      >
        <View style={statusRing ? styles.avatarRingTouchable : [styles.avatarWrap, { backgroundColor: avatarBg }]}>
          {statusRing ? (
            <View
              style={[
                styles.statusRingOuter,
                {
                  borderColor: statusRing.hasUnviewed ? "#25D366" : "#8696a0",
                  borderStyle:
                    Platform.OS !== "web" && statusRing.count > 1 && !statusRing.hasUnviewed ? "dashed" : "solid",
                },
              ]}
            >
              {chat.avatar ? (
                <Image source={{ uri: chat.avatar }} style={styles.statusRingInnerImg} contentFit="cover" />
              ) : (
                <View style={[styles.statusRingInnerFallback, { backgroundColor: avatarBg }]}>
                  <Text style={styles.statusRingInnerText}>{initials}</Text>
                </View>
              )}
              {statusRing.count > 1 && !selected && (
                <View style={[styles.statusRingCountBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.statusRingCountText}>{statusRing.count > 9 ? "9+" : statusRing.count}</Text>
                </View>
              )}
            </View>
          ) : chat.avatar ? (
            <Image source={{ uri: chat.avatar }} style={styles.avatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.avatarText}>{initials}</Text>
          )}
        </View>
        {!chat.isGroup && chat.isOnline && (
          <View style={[styles.onlineDot, { backgroundColor: colors.onlineGreen }]} />
        )}
        {selected ? (
          <View style={[styles.selectedBadge, { backgroundColor: colors.primary }]}>
            <Ionicons name="checkmark" size={15} color="#fff" />
          </View>
        ) : null}
      </TouchableOpacity>

      <TouchableOpacity style={styles.rowContent} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
        <View style={styles.rowTop}>
          <View style={styles.nameRow}>
            {chat.isPinned && <Ionicons name="pin" size={12} color={colors.mutedForeground} style={{ marginRight: 4, transform: [{ rotate: "45deg" }] }} />}
            {chat.isMuted && <Ionicons name="volume-mute" size={12} color={colors.mutedForeground} style={{ marginRight: 4 }} />}
            {isLocked && <Ionicons name="lock-closed" size={12} color={colors.mutedForeground} style={{ marginRight: 4 }} />}
            {isShortcut && <Ionicons name="apps" size={12} color={colors.mutedForeground} style={{ marginRight: 4 }} />}
            {isFavorite && <Ionicons name="heart" size={12} color={colors.primary} style={{ marginRight: 4 }} />}
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{chat.name}</Text>
          </View>
          <Text style={[styles.time, { color: unreadCount > 0 ? colors.primary : colors.mutedForeground }]}>
            {chat.lastMessageTime ? formatTime(chat.lastMessageTime) : ""}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.lastMsg, { color: colors.mutedForeground }]} numberOfLines={1}>
            {chat.lastMessage ?? "No messages yet"}
          </Text>
          {unreadCount > 0 && !chat.isMuted && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          )}
          {unreadCount > 0 && chat.isMuted && (
            <View style={[styles.badge, { backgroundColor: colors.mutedForeground }]}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 10 },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  archivedHeaderTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  archivedBackBtn: { paddingRight: 4, paddingVertical: 4 },
  headerRight: { flexDirection: "row", gap: 3, alignItems: "center" },
  headerBtn: { padding: 6 },
  archivedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  archivedRowLeft: { flexDirection: "row", alignItems: "center", gap: 18 },
  archivedRowText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  archivedCount: { fontSize: 13, fontFamily: "Inter_700Bold" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginVertical: 8, borderRadius: 24, paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  tabs: { flexDirection: "row", borderBottomWidth: 0.5, marginHorizontal: 16 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tabLine: { position: "absolute", bottom: 0, height: 2, width: "80%", borderRadius: 1 },
  filterChips: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingBottom: 8 },
  filterChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  filterChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterChipPlus: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 0.5 },
  avatarTapArea: { width: 60, height: 58, marginRight: 10, alignItems: "center", justifyContent: "center", position: "relative", overflow: "visible" },
  avatarWrap: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" },
  avatarRingTouchable: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  statusRingOuter: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2.5,
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRingInnerImg: { width: 44, height: 44, borderRadius: 22 },
  statusRingInnerFallback: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  statusRingInnerText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  statusRingCountBadge: {
    position: "absolute",
    bottom: -1,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRingCountText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
  avatarImg: { width: 52, height: 52 },
  avatarText: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  onlineDot: { width: 14, height: 14, borderRadius: 7, position: "absolute", bottom: 4, right: 3, borderWidth: 2, borderColor: "#fff" },
  selectedBadge: {
    position: "absolute",
    right: 0,
    bottom: 1,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#fff",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 2,
  },
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
  previewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  previewCard: { width: "100%", maxWidth: 280, borderRadius: 2, overflow: "hidden" },
  previewName: { fontSize: 18, fontFamily: "Inter_600SemiBold", paddingHorizontal: 12, paddingVertical: 10 },
  previewImage: { width: "100%", height: 300 },
  previewFallback: { width: "100%", height: 300, alignItems: "center", justifyContent: "center" },
  previewFallbackText: { color: "#fff", fontSize: 56, fontFamily: "Inter_700Bold" },
  previewActions: { height: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-evenly", borderTopWidth: 1 },
  previewActionBtn: { minWidth: 64, alignItems: "center", justifyContent: "center" },
});
