import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useApp, type Chat } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { authFetchHeaders } from "@/lib/authenticatedMedia";
import {
  deliverIncomingShareToChat,
  sharePreviewKind,
  sharePreviewUri,
} from "@/lib/deliverIncomingShare";
import {
  finishIncomingShareFlow,
  payloadHasShareableContent,
  payloadPreviewText,
  waitForIncomingShare,
  ensureSharePayloadFiles,
  type IncomingSharePayload,
} from "@/lib/incomingSharePayload";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";

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

export default function ShareToChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { resetShareIntent } = useShareIntentContext();
  const { t } = useUiPreferences();
  const { chats, user, isAuthenticated, isInitialized, sendMessage, sendPreparedMediaMessage, sendDocumentMessage } = useApp();

  const [payload, setPayload] = useState<IncomingSharePayload | null>(null);
  const [loadingShare, setLoadingShare] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const closeShareFlow = useCallback(async () => {
    await finishIncomingShareFlow();
    resetShareIntent();
    router.replace("/(tabs)/chats");
  }, [resetShareIntent, router]);

  useEffect(() => {
    if (Platform.OS === "web" || !isInitialized) return;
    let cancelled = false;
    void (async () => {
      setLoadingShare(true);
      setLoadError(null);

      const data = await waitForIncomingShare(20_000);
      if (cancelled) return;

      if (!data || !payloadHasShareableContent(data)) {
        const retry = await waitForIncomingShare(8_000);
        if (cancelled) return;
        if (!retry || !payloadHasShareableContent(retry)) {
          if (!isAuthenticated) {
            router.replace("/auth/phone");
            return;
          }
          setLoadError("Videh could not read what you shared. Try Share again from the other app.");
          setLoadingShare(false);
          return;
        }
        if (!isAuthenticated) {
          router.replace("/auth/phone");
          return;
        }
        setPayload(retry);
        setLoadingShare(false);
        return;
      }

      if (!isAuthenticated) {
        router.replace("/auth/phone");
        return;
      }
      setPayload(data);
      setLoadingShare(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isInitialized, router, resetShareIntent]);

  const targets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chats
      .filter((c) => c.id && !c.id.startsWith("new_"))
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0));
  }, [chats, search]);

  const previewUri = sharePreviewUri(payload);
  const previewKind = sharePreviewKind(payload);
  const resolvedPreview = previewUri ? (resolvePublicAssetUrl(previewUri) ?? previewUri) : undefined;
  const previewText = payloadPreviewText(payload);

  const sendToChat = useCallback(async (chatId: string) => {
    if (!payload || sendingTo) return;
    setSendingTo(chatId);
    try {
      let ready = payload;
      try {
        ready = await Promise.race([
          ensureSharePayloadFiles(payload),
          new Promise<IncomingSharePayload>((_, reject) => {
            setTimeout(() => reject(new Error("File copy timed out")), 45_000);
          }),
        ]);
      } catch {
        Alert.alert("Could not prepare file", "The shared file took too long to load. Try sharing again.");
        return;
      }
      const sendFns = { sendMessage, sendPreparedMediaMessage, sendDocumentMessage };
      const ok = await deliverIncomingShareToChat(chatId, ready, sendFns);
      if (!ok) {
        Alert.alert("Could not share", "Videh could not send this content. Try sharing again from Google Pay.");
        return;
      }
      await finishIncomingShareFlow();
      resetShareIntent();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const name = chats.find((c) => c.id === chatId)?.name ?? "chat";
      router.replace("/(tabs)/chats");
      setTimeout(() => {
        Alert.alert("Sent", `Shared to ${name}`);
      }, 200);
    } finally {
      setSendingTo(null);
    }
  }, [payload, sendingTo, sendMessage, sendPreparedMediaMessage, sendDocumentMessage, router, chats, resetShareIntent]);

  if (loadingShare || (!payload && !loadError)) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Reading shared content…
        </Text>
        <TouchableOpacity onPress={() => void closeShareFlow()} style={{ marginTop: 20, padding: 12 }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadError || !payload) {
    return (
      <View style={[styles.screen, styles.centered, { backgroundColor: colors.background, padding: 24 }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.mutedForeground} />
        <Text style={[styles.loadingText, { color: colors.foreground, textAlign: "center", marginTop: 12 }]}>
          {loadError ?? "Nothing to share"}
        </Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          onPress={() => void closeShareFlow()}
        >
          <Text style={{ color: "#fff", fontFamily: "Inter_700Bold" }}>Back to chats</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderRow = ({ item }: { item: Chat }) => {
    const busy = sendingTo === item.id;
    return (
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border, opacity: sendingTo && !busy ? 0.5 : 1 }]}
        onPress={() => { void sendToChat(item.id); }}
        activeOpacity={0.7}
        disabled={Boolean(sendingTo)}
      >
        <ChatAvatar chat={item} />
        <View style={styles.rowText}>
          <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.isGroup ? "Group" : "Tap to send"}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="send" size={20} color={colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => { void closeShareFlow(); }} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Send to…</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setSearchOpen((v) => !v)} hitSlop={12}>
          <Ionicons name={searchOpen ? "close" : "search"} size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {searchOpen ? (
        <View style={[styles.searchWrap, { backgroundColor: colors.card }]}>
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

      <Text style={[styles.hint, { color: colors.mutedForeground }]}>
        Tap a chat to send instantly
      </Text>

      {(previewText || resolvedPreview) ? (
        <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {resolvedPreview ? (
            <Image
              source={{
                uri: resolvedPreview,
                ...(user?.sessionToken ? { headers: authFetchHeaders(user.sessionToken) } : {}),
              }}
              style={styles.previewImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.previewImage, styles.previewImagePlaceholder, { backgroundColor: colors.muted }]}>
              <Ionicons
                name={previewKind === "video" ? "videocam-outline" : previewKind === "file" ? "document-outline" : "chatbubble-outline"}
                size={22}
                color={colors.mutedForeground}
              />
            </View>
          )}
          {previewText ? (
            <Text style={[styles.previewTextBody, { color: colors.foreground }]} numberOfLines={3}>
              {previewText}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!isInitialized ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={targets}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              {chats.length === 0 ? "Loading chats…" : "No Videh chats found."}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 15, fontFamily: "Inter_400Regular", marginTop: 8 },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
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
  },
  searchInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  hint: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  previewImage: { width: 56, height: 56, borderRadius: 8 },
  previewImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  previewTextBody: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
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
  empty: { textAlign: "center", paddingVertical: 40, fontFamily: "Inter_400Regular", fontSize: 15 },
});
