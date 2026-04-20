import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Clipboard,
  Dimensions,
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
import { useApp, Message } from "@/context/AppContext";
import { formatFullTime } from "@/utils/time";
import { DropdownMenu } from "@/components/DropdownMenu";

const BASE_URL = (() => {
  const d = process.env.EXPO_PUBLIC_DOMAIN;
  return d ? `https://${d}` : "";
})();
const { width: W } = Dimensions.get("window");

type ReplyData = { id: string; text: string; senderId: string } | null;

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: rawId, name, otherUserId: otherUserIdParam, otherAvatar } = useLocalSearchParams<{
    id: string;
    name: string;
    otherUserId?: string;
    otherAvatar?: string;
  }>();

  const { chats, sendMessage, sendImageMessage, setTyping, clearTyping, markAsRead, deleteMessage, starMessage, muteChat, createDirectChat, loadMessages, user } = useApp();

  // For "new_" chats we resolve the real DB ID first
  const [chatId, setChatId] = useState<string | null>(rawId?.startsWith("new_") ? null : rawId ?? null);
  const [initializing, setInitializing] = useState(rawId?.startsWith("new_") ?? false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);

  // Resolve "new_" chat → real DB chat
  useEffect(() => {
    if (!rawId?.startsWith("new_")) return;
    const otherUId = otherUserIdParam ? Number(otherUserIdParam) : Number(rawId.replace("new_", ""));
    if (!otherUId) { setInitializing(false); return; }
    createDirectChat(otherUId, name ?? "Chat", otherAvatar ?? undefined)
      .then((realId) => { setChatId(realId); setInitializing(false); })
      .catch(() => setInitializing(false));
  }, [rawId]);

  // Load messages from DB when chatId is resolved
  useEffect(() => {
    if (!chatId) return;
    markAsRead(chatId);
    loadMessages(chatId);
  }, [chatId]);

  // Poll for new messages every 4s + typing every 3s while screen is focused
  useFocusEffect(
    useCallback(() => {
      if (!chatId) return;
      const msgTimer = setInterval(() => loadMessages(chatId), 4000);
      const typingTimer = setInterval(async () => {
        if (!user?.dbId) return;
        try {
          const res = await fetch(`${BASE_URL}/api/chats/${chatId}/typing?userId=${user.dbId}`);
          const data = await res.json();
          setTypingNames(data.typing ?? []);
        } catch {}
      }, 3000);
      return () => { clearInterval(msgTimer); clearInterval(typingTimer); };
    }, [chatId, user?.dbId])
  );

  const chat = chats.find((c) => c.id === chatId);
  const messages = chat?.messages ?? [];
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyData>(null);
  const inputRef = useRef<TextInput>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextChange = useCallback((val: string) => {
    setText(val);
    if (!chatId) return;
    if (val.length > 0) {
      setTyping(chatId);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => { clearTyping(chatId); }, 3000);
    } else {
      clearTyping(chatId);
    }
  }, [chatId, setTyping, clearTyping]);

  const handleSend = useCallback(() => {
    if (!text.trim() || !chatId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearTyping(chatId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendMessage(chatId, text.trim(), replyTo?.id);
    setText("");
    setReplyTo(null);
  }, [text, chatId, sendMessage, replyTo, clearTyping]);

  const sendMediaMessage = async (type: "camera" | "gallery" | "document" | "location" | "contact") => {
    if (!chatId) return;
    if (type === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed"); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: false });
      if (!result.canceled && result.assets[0]) {
        sendImageMessage(chatId, result.assets[0].uri);
      }
    } else if (type === "gallery") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed"); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.7, base64: false });
      if (!result.canceled && result.assets[0]) {
        sendImageMessage(chatId, result.assets[0].uri);
      }
    } else if (type === "document") {
      sendMessage(chatId, "📄 Document");
    } else if (type === "location") {
      sendMessage(chatId, "📍 Location shared");
    } else if (type === "contact") {
      sendMessage(chatId, "👤 Contact shared");
    }
  };

  const showAttachMenu = () => {
    Alert.alert("Attach", "", [
      { text: "📷 Camera", onPress: () => sendMediaMessage("camera") },
      { text: "🖼 Gallery", onPress: () => sendMediaMessage("gallery") },
      { text: "📄 Document", onPress: () => sendMediaMessage("document") },
      { text: "📍 Location", onPress: () => sendMediaMessage("location") },
      { text: "👤 Contact", onPress: () => sendMediaMessage("contact") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const longPressMsg = (msg: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isMine = msg.senderId === "me";
    const isDeleted = msg.type === "deleted";
    if (isDeleted) return;

    const options: any[] = [
      {
        text: "↩ Reply", onPress: () => {
          setReplyTo({ id: msg.id, text: msg.text, senderId: msg.senderId });
          inputRef.current?.focus();
        }
      },
      {
        text: "📋 Copy", onPress: () => {
          Clipboard.setString(msg.text);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      },
      {
        text: "⭐ Star", onPress: () => {
          if (chatId) starMessage(chatId, msg.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      },
    ];

    if (isMine) {
      options.push({
        text: "🗑 Delete",
        style: "destructive" as const,
        onPress: () => {
          Alert.alert("Delete Message", "Delete this message?", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete for me", onPress: () => { if (chatId) deleteMessage(chatId, msg.id); } },
          ]);
        }
      });
    }

    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Message", "", options);
  };

  const renderMsg = ({ item }: { item: Message }) => {
    const isMe = item.senderId === "me";
    const isDeleted = item.type === "deleted";

    return (
      <TouchableOpacity
        onLongPress={() => longPressMsg(item)}
        activeOpacity={0.88}
        style={[styles.msgWrap, isMe ? styles.msgRight : styles.msgLeft]}
      >
        <View
          style={[
            styles.bubble,
            { backgroundColor: isMe ? colors.chatBubbleSent : colors.chatBubbleReceived },
            isDeleted && { opacity: 0.55 },
          ]}
        >
          {item.replyToId && item.replyText && (
            <View style={[styles.replyStrip, { borderLeftColor: colors.primary, backgroundColor: isMe ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.07)" }]}>
              <Text style={[styles.replyText, { color: colors.primary }]} numberOfLines={1}>{item.replyText}</Text>
            </View>
          )}
          {isDeleted ? (
            <View style={styles.deletedRow}>
              <Ionicons name="ban-outline" size={13} color={colors.mutedForeground} />
              <Text style={[styles.deletedText, { color: colors.mutedForeground }]}> This message was deleted</Text>
            </View>
          ) : (item.type === "image" || item.type === "video") && item.mediaUrl ? (
            <>
              <Image
                source={{ uri: item.mediaUrl }}
                style={styles.msgImage}
                contentFit="cover"
              />
              {item.text && item.text !== "📷 Photo" && (
                <Text style={[styles.msgText, { color: colors.foreground }]}>{item.text}</Text>
              )}
            </>
          ) : (
            <Text style={[styles.msgText, { color: colors.foreground }]}>{item.text}</Text>
          )}
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, { color: colors.mutedForeground }]}>
              {formatFullTime(item.timestamp)}
            </Text>
            {isMe && !isDeleted && (
              <Ionicons
                name={item.status === "read" ? "checkmark-done" : item.status === "delivered" ? "checkmark-done-outline" : "checkmark-outline"}
                size={14}
                color={item.status === "read" ? "#53BDEB" : colors.mutedForeground}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const displayName = name ?? chat?.name ?? "Chat";
  const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (displayName.charCodeAt(0) * 37) % 360;
  const avatarBg = `hsl(${hue},50%,40%)`;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const chatMenuItems = [
    { label: "Chat info", icon: "information-circle-outline", onPress: () => chatId && router.push({ pathname: "/chat-info/[id]", params: { id: chatId, name: displayName } }) },
    { label: "Starred messages", icon: "star-outline", onPress: () => router.push("/starred") },
    { label: "Mute notifications", icon: "notifications-off-outline", onPress: () => chatId && muteChat(chatId) },
    { label: "Media, links, docs", icon: "image-outline", onPress: () => Alert.alert("Media", "No media shared yet in this chat.") },
    { label: "Search", icon: "search-outline", onPress: () => Alert.alert("Search", "In-chat search coming soon.") },
    { label: "Export chat", icon: "share-outline", onPress: () => Alert.alert("Export", "Chat export coming soon.") },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.chatBackground }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={[styles.headerAvatarWrap, { backgroundColor: avatarBg }]}>
          {chat?.avatar ? (
            <Image source={{ uri: chat.avatar }} style={styles.headerAvatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.headerAvatarText}>{initials}</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.headerInfo}
          activeOpacity={0.7}
          onPress={() => chatId && router.push({ pathname: "/chat-info/[id]", params: { id: chatId, name: displayName } })}
        >
          <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
          <Text style={[styles.headerStatus, typingNames.length > 0 && { color: "#a7f3d0" }]}>
            {typingNames.length > 0
              ? "typing..."
              : chat?.isGroup
                ? `${chat.members?.length ?? 0} members`
                : initializing
                  ? "connecting..."
                  : chat?.isOnline
                    ? "online"
                    : "tap for info"}
          </Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => chatId && router.push({ pathname: "/call/[id]", params: { id: chatId, name: displayName, type: "video" } })}
          >
            <Ionicons name="videocam-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => chatId && router.push({ pathname: "/call/[id]", params: { id: chatId, name: displayName, type: "audio" } })}
          >
            <Ionicons name="call-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMenuOpen(true); }}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Chat three-dot dropdown */}
      <DropdownMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={chatMenuItems}
        topOffset={topPad + 50}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={renderMsg}
          inverted
          contentContainerStyle={{ paddingVertical: 10, paddingHorizontal: 8 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            initializing ? (
              <View style={styles.initWrap}>
                <Text style={[styles.initText, { color: colors.mutedForeground }]}>Starting chat...</Text>
              </View>
            ) : null
          }
        />

        {/* Reply preview */}
        {replyTo && (
          <View style={[styles.replyPreview, { backgroundColor: colors.card, borderLeftColor: colors.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyPreviewLabel, { color: colors.primary }]}>
                {replyTo.senderId === "me" ? "You" : displayName}
              </Text>
              <Text style={[styles.replyPreviewText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {replyTo.text}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.background, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8) }]}>
          <TouchableOpacity style={styles.inputIcon}>
            <Ionicons name="happy-outline" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={[styles.inputField, { backgroundColor: colors.card, color: colors.foreground }]}
            placeholder="Message"
            placeholderTextColor={colors.mutedForeground}
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={2000}
            editable={!initializing}
          />
          {!text.trim() && (
            <TouchableOpacity style={styles.inputIcon} onPress={showAttachMenu}>
              <Ionicons name="attach-outline" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          {!text.trim() && (
            <TouchableOpacity style={styles.inputIcon} onPress={() => sendMediaMessage("camera")}>
              <Ionicons name="camera-outline" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary }, initializing && { opacity: 0.5 }]}
            disabled={initializing}
            onPress={text.trim() ? handleSend : () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Alert.alert("Voice Message", "Hold to record a voice message");
            }}
          >
            <Ionicons name={text.trim() ? "send" : "mic-outline"} size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 10, gap: 6 },
  backBtn: { padding: 6 },
  headerAvatarWrap: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  headerAvatarImg: { width: 38, height: 38 },
  headerAvatarText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  headerInfo: { flex: 1 },
  headerName: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerStatus: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  headerActions: { flexDirection: "row" },
  headerBtn: { padding: 6 },
  initWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  initText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  msgWrap: { marginVertical: 2 },
  msgLeft: { alignItems: "flex-start" },
  msgRight: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  replyStrip: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    marginBottom: 5,
    paddingVertical: 2,
    borderRadius: 2,
  },
  replyText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  msgText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  msgImage: { width: W * 0.6, height: W * 0.6, borderRadius: 8, marginBottom: 4 },
  msgMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 3 },
  msgTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  deletedRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  deletedText: { fontSize: 14, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 4,
    gap: 8,
  },
  replyPreviewLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  replyPreviewText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 4,
  },
  inputIcon: { padding: 6, paddingBottom: 10 },
  inputField: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
