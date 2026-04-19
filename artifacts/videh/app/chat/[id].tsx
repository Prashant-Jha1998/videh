import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Clipboard,
  FlatList,
  Image,
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

type ReplyData = { id: string; text: string; senderId: string } | null;

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { chats, sendMessage, markAsRead, deleteMessage, starMessage, forwardMessage } = useApp();

  const chat = chats.find((c) => c.id === id);
  const messages = chat?.messages ?? [];
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyData>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (id) markAsRead(id);
  }, [id]);

  const handleSend = useCallback(() => {
    if (!text.trim() || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const msgText = replyTo ? `↩ ${replyTo.text.slice(0, 30)}\n${text.trim()}` : text.trim();
    sendMessage(id, msgText);
    setText("");
    setReplyTo(null);

    // Simulate reply after 1-3 seconds for non-group chats
    if (chat && !chat.isGroup) {
      const delay = 1200 + Math.random() * 2000;
      const replies = [
        "Got it! 👍", "Sure!", "Ok!", "😊", "Thanks!", "Will do!",
        "Sounds good", "Noted", "Perfect!", "👌", "Hmm, let me think...",
        "That's great!", "Okay okay", "On it!", "Let's do it 🔥"
      ];
      setTimeout(() => {
        const replyText = replies[Math.floor(Math.random() * replies.length)];
        sendMessage(id, replyText);
      }, delay);
    }
  }, [text, id, sendMessage, chat, replyTo]);

  const sendImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo library access to send images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0] && id) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendMessage(id, `📷 Photo`);
    }
  };

  const showAttachMenu = () => {
    Alert.alert("Attach", "", [
      { text: "📷 Camera", onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") { Alert.alert("Permission needed"); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!result.canceled && id) sendMessage(id, "📷 Photo");
      }},
      { text: "🖼 Gallery", onPress: sendImage },
      { text: "📄 Document", onPress: () => id && sendMessage(id, "📄 Document") },
      { text: "📍 Location", onPress: () => id && sendMessage(id, "📍 Location shared") },
      { text: "👤 Contact", onPress: () => id && sendMessage(id, "👤 Contact shared") },
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
          starMessage?.(id!, msg.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Starred", "Message added to starred messages.");
        }
      },
      {
        text: "↗ Forward", onPress: () => {
          Alert.alert("Forward", "Forward this message to another chat?", [
            { text: "Cancel", style: "cancel" },
            { text: "Forward", onPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) },
          ]);
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
            { text: "Delete for me", onPress: () => deleteMessage(id!, msg.id) },
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
    const isReply = item.text.startsWith("↩ ");

    let replyPart = "";
    let mainPart = item.text;
    if (isReply && !isDeleted) {
      const lines = item.text.split("\n");
      replyPart = lines[0].replace("↩ ", "");
      mainPart = lines.slice(1).join("\n");
    }

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
          {isReply && !isDeleted && (
            <View style={[styles.replyStrip, { borderLeftColor: colors.primary, backgroundColor: isMe ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.07)" }]}>
              <Text style={[styles.replyText, { color: colors.primary }]} numberOfLines={1}>{replyPart}</Text>
            </View>
          )}
          {isDeleted ? (
            <View style={styles.deletedRow}>
              <Ionicons name="ban-outline" size={13} color={colors.mutedForeground} />
              <Text style={[styles.deletedText, { color: colors.mutedForeground }]}> This message was deleted</Text>
            </View>
          ) : (
            <Text style={[styles.msgText, { color: colors.foreground }]}>{mainPart}</Text>
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

  const initials = (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = ((name ?? "?").charCodeAt(0) * 37) % 360;
  const avatarBg = `hsl(${hue},50%,40%)`;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.chatBackground }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        {chat?.avatar ? (
          <Image source={{ uri: chat.avatar }} style={styles.headerAvatarImg} />
        ) : (
          <View style={[styles.headerAvatar, { backgroundColor: avatarBg }]}>
            <Text style={styles.headerAvatarText}>{initials}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.headerInfo} activeOpacity={0.7}>
          <Text style={styles.headerName} numberOfLines={1}>{name ?? chat?.name}</Text>
          <Text style={styles.headerStatus}>
            {chat?.isGroup ? `${chat.members?.length ?? 0} members` : chat?.isOnline ? "online" : "last seen recently"}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push({ pathname: "/call/[id]", params: { id: id!, name: name!, type: "video" } })}>
            <Ionicons name="videocam-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push({ pathname: "/call/[id]", params: { id: id!, name: name!, type: "audio" } })}>
            <Ionicons name="call-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => {
            Alert.alert(chat?.name ?? "Chat", "", [
              { text: "⭐ Starred Messages", onPress: () => router.push("/starred") },
              { text: "🔇 Mute Notifications" },
              { text: "📎 Media, Links, Docs" },
              { text: "🔍 Search" },
              { text: "Cancel", style: "cancel" },
            ]);
          }}>
            <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

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
        />

        {/* Reply preview */}
        {replyTo && (
          <View style={[styles.replyPreview, { backgroundColor: colors.card, borderLeftColor: colors.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyPreviewLabel, { color: colors.primary }]}>
                {replyTo.senderId === "me" ? "You" : (name ?? "Them")}
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
          <TouchableOpacity style={styles.inputIcon} onPress={() => setShowEmojiPicker(!showEmojiPicker)}>
            <Ionicons name="happy-outline" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={[styles.inputField, { backgroundColor: colors.card, color: colors.foreground }]}
            placeholder="Message"
            placeholderTextColor={colors.mutedForeground}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
          />
          {!text.trim() && (
            <TouchableOpacity style={styles.inputIcon} onPress={showAttachMenu}>
              <Ionicons name="attach-outline" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          {!text.trim() && (
            <TouchableOpacity style={styles.inputIcon} onPress={async () => {
              const { status } = await ImagePicker.requestCameraPermissionsAsync();
              if (status !== "granted") { Alert.alert("Permission needed"); return; }
              const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
              if (!result.canceled && id) sendMessage(id, "📷 Photo");
            }}>
              <Ionicons name="camera-outline" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary }]}
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
  headerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  headerInfo: { flex: 1 },
  headerName: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerStatus: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular" },
  headerActions: { flexDirection: "row" },
  headerBtn: { padding: 6 },
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
