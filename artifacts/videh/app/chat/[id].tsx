import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useApp, Message } from "@/context/AppContext";
import { formatFullTime } from "@/utils/time";

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const { chats, sendMessage, markAsRead, deleteMessage } = useApp();

  const chat = chats.find((c) => c.id === id);
  const messages = chat?.messages ?? [];
  const [text, setText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (id) markAsRead(id);
  }, [id]);

  useEffect(() => {
    if (text) {
      setIsTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setIsTyping(false), 2000);
    } else {
      setIsTyping(false);
    }
  }, [text]);

  const handleSend = useCallback(() => {
    if (!text.trim() || !id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage(id, text.trim());
    setText("");

    // Simulate reply after 1-3 seconds
    if (chat && !chat.isGroup) {
      const delay = 1000 + Math.random() * 2000;
      const replies = ["Got it!", "Sure 👍", "Ok!", "😊", "Thanks!", "Will do!", "Sounds good", "Noted"];
      setTimeout(() => {
        const replyText = replies[Math.floor(Math.random() * replies.length)];
        sendMessage(id, `[Auto] ${replyText}`);
      }, delay);
    }
  }, [text, id, sendMessage, chat]);

  const longPressMsg = (msg: Message) => {
    if (msg.senderId !== "me") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("Message", "", [
      { text: "Delete", style: "destructive", onPress: () => deleteMessage(id!, msg.id) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const renderMsg = ({ item }: { item: Message }) => {
    const isMe = item.senderId === "me";
    const isDeleted = item.type === "deleted";
    return (
      <TouchableOpacity
        onLongPress={() => longPressMsg(item)}
        activeOpacity={0.85}
        style={[styles.msgWrap, isMe ? styles.msgRight : styles.msgLeft]}
      >
        <View
          style={[
            styles.bubble,
            { backgroundColor: isMe ? colors.chatBubbleSent : colors.chatBubbleReceived },
            isDeleted && { opacity: 0.6 },
          ]}
        >
          {isDeleted ? (
            <View style={styles.deletedRow}>
              <Ionicons name="ban-outline" size={14} color={colors.mutedForeground} />
              <Text style={[styles.deletedText, { color: colors.mutedForeground }]}> {item.text}</Text>
            </View>
          ) : (
            <Text style={[styles.msgText, { color: colors.foreground }]}>{item.text}</Text>
          )}
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, { color: colors.mutedForeground }]}>
              {formatFullTime(item.timestamp)}
            </Text>
            {isMe && !isDeleted && (
              <Ionicons
                name={item.status === "read" ? "checkmark-done" : "checkmark"}
                size={14}
                color={item.status === "read" ? colors.primary : colors.mutedForeground}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const initials = (name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (name ?? "?").charCodeAt(0) * 37 % 360;
  const avatarBg = `hsl(${hue},50%,45%)`;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.chatBackground }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={[styles.headerAvatar, { backgroundColor: avatarBg }]}>
          <Text style={styles.headerAvatarText}>{initials}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
          <Text style={styles.headerStatus}>{chat?.isOnline ? "online" : "last seen recently"}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push({ pathname: "/call/[id]", params: { id: id!, name: name!, type: "video" } })}>
            <Ionicons name="videocam-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push({ pathname: "/call/[id]", params: { id: id!, name: name!, type: "audio" } })}>
            <Ionicons name="call-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn}>
            <Ionicons name="ellipsis-vertical" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={renderMsg}
          inverted
          contentContainerStyle={{ paddingVertical: 10, paddingHorizontal: 10 }}
          ListHeaderComponent={
            isTyping ? (
              <View style={[styles.typingBubble, { backgroundColor: colors.chatBubbleReceived }]}>
                <Text style={[styles.typingText, { color: colors.mutedForeground }]}>typing...</Text>
              </View>
            ) : null
          }
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          scrollEnabled
          showsVerticalScrollIndicator={false}
        />

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: colors.background, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8) }]}>
          <TouchableOpacity style={styles.inputIcon}>
            <Ionicons name="happy-outline" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
          <TextInput
            style={[styles.inputField, { backgroundColor: colors.card, color: colors.foreground }]}
            placeholder="Message"
            placeholderTextColor={colors.mutedForeground}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity style={styles.inputIcon}>
            <Ionicons name="attach-outline" size={24} color={colors.mutedForeground} />
          </TouchableOpacity>
          {text.trim() ? (
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: colors.primary }]} onPress={handleSend}>
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.sendBtn, { backgroundColor: colors.primary }]}>
              <Ionicons name="mic-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 10, gap: 8 },
  backBtn: { padding: 6 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerAvatarText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  headerInfo: { flex: 1 },
  headerName: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerStatus: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_400Regular" },
  headerActions: { flexDirection: "row" },
  headerBtn: { padding: 6 },
  msgWrap: { marginVertical: 2 },
  msgLeft: { alignItems: "flex-start" },
  msgRight: { alignItems: "flex-end" },
  bubble: { maxWidth: "80%", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  msgText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 20 },
  msgMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  msgTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  deletedRow: { flexDirection: "row", alignItems: "center" },
  deletedText: { fontSize: 14, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  typingBubble: { alignSelf: "flex-start", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginVertical: 4 },
  typingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 8, gap: 6 },
  inputIcon: { padding: 4, paddingBottom: 10 },
  inputField: { flex: 1, borderRadius: 24, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
