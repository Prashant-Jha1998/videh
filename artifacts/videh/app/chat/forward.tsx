import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { useApp, type Chat, type Message } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";
import { authFetchHeaders } from "@/lib/authenticatedMedia";

function ChatAvatar({ chat }: { chat: Chat }) {
  const initials = (chat.name ?? "?").slice(0, 2).toUpperCase();
  const hue = ((chat.name ?? "?").charCodeAt(0) * 37) % 360;
  if (chat.avatar) {
    return <Image source={{ uri: chat.avatar }} style={styles.avatar} contentFit="cover" />;
  }
  return (
    <View style={[styles.avatar, { backgroundColor: `hsl(${hue},50%,40%)` }]}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

function forwardPreviewUri(msg: Message | undefined, sessionToken?: string | null): string | undefined {
  if (!msg) return undefined;
  if (msg.type === "image" || msg.type === "video") {
    const uri = msg.localMediaUri ?? msg.mediaUrl;
    return uri ? (resolvePublicAssetUrl(uri) ?? uri) : undefined;
  }
  if (msg.type === "album") {
    const urls = msg.albumUrls ?? msg.albumLocalUrls;
    const first = urls?.[0];
    return first ? (resolvePublicAssetUrl(first) ?? first) : undefined;
  }
  return undefined;
}

export default function ForwardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useUiPreferences();
  const { chats, user, forwardMessage, sendMessage } = useApp();
  const { chatId, messageIds: messageIdsParam } = useLocalSearchParams<{
    chatId?: string;
    messageIds?: string;
  }>();

  const messageIds = useMemo(
    () => (messageIdsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    [messageIdsParam],
  );

  const sourceChat = chats.find((c) => c.id === chatId);
  const sourceMessages = useMemo(
    () => (sourceChat?.messages ?? []).filter((m) => messageIds.includes(m.id)),
    [sourceChat?.messages, messageIds],
  );
  const previewMsg = sourceMessages[0];
  const previewUri = forwardPreviewUri(previewMsg, user?.sessionToken);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const targets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chats
      .filter((c) => c.id && !c.id.startsWith("new_") && c.id !== chatId)
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0));
  }, [chats, chatId, search]);

  const recentTargets = targets;
  const selectedCount = selected.size;

  const toggleTarget = (id: string) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!chatId || messageIds.length === 0 || selected.size === 0 || sending) return;
    setSending(true);
    try {
      const destIds = [...selected];
      for (const destId of destIds) {
        for (const msgId of messageIds) {
          forwardMessage(chatId, msgId, destId);
        }
        const cap = caption.trim();
        if (cap) sendMessage(destId, cap);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      const destNames = destIds
        .map((id) => chats.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      Alert.alert(
        "Forwarded",
        messageIds.length > 1
          ? `Sent ${messageIds.length} messages to ${destNames}`
          : `Sent to ${destNames} on Videh`,
      );
    } finally {
      setSending(false);
    }
  };

  const renderRow = ({ item }: { item: Chat }) => {
    const checked = selected.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={() => toggleTarget(item.id)}
        activeOpacity={0.7}
      >
        <ChatAvatar chat={item} />
        <View style={styles.rowText}>
          <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.isGroup ? "Group" : "Videh contact"}
          </Text>
        </View>
        <View
          style={[
            styles.radio,
            { borderColor: checked ? colors.primary : colors.mutedForeground },
            checked && { backgroundColor: colors.primary },
          ]}
        >
          {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Forward to…</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setSearchOpen((v) => !v)}
          hitSlop={12}
        >
          <Ionicons name={searchOpen ? "close" : "search"} size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {searchOpen ? (
        <View style={[styles.searchWrap, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            autoFocus
            value={search}
            onChangeText={setSearch}
            placeholder={t("chat.searchChats")}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Recent chats</Text>

      <FlatList
        data={recentTargets}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: selectedCount > 0 ? 100 : 24 }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            No other Videh chats found.
          </Text>
        }
      />

      {selectedCount > 0 ? (
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          {previewUri ? (
            <Image
              source={{
                uri: previewUri,
                ...(user?.sessionToken ? { headers: authFetchHeaders(user.sessionToken) } : {}),
              }}
              style={styles.previewThumb}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.previewThumb, styles.previewThumbPlaceholder, { backgroundColor: colors.muted }]}>
              <Ionicons name="chatbubble-outline" size={20} color={colors.mutedForeground} />
            </View>
          )}
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Add a message…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.captionInput, { color: colors.foreground, backgroundColor: colors.background }]}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: sending ? 0.6 : 1 }]}
            onPress={() => { void handleSend(); }}
            disabled={sending}
          >
            <Ionicons name="arrow-forward" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderBottomWidth: 0,
  },
  searchInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  rowSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: "hidden" },
  avatarText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16, textAlign: "center", lineHeight: 48 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { textAlign: "center", paddingVertical: 40, fontFamily: "Inter_400Regular", fontSize: 15 },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  previewThumb: { width: 44, height: 44, borderRadius: 6 },
  previewThumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  captionInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
});
