import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import { Audio } from "expo-av";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Clipboard,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp, type Message } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";
import { formatFullTime } from "@/utils/time";
import { DropdownMenu } from "@/components/DropdownMenu";

const BASE_URL = getApiUrl();
const { width: W } = Dimensions.get("window");
const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

type ReplyData = { id: string; text: string; senderId: string; senderName?: string } | null;

// Extract URLs from text
function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) ?? [];
}

// Mention-aware text renderer
function MentionText({ text, style }: { text: string; style?: any }) {
  const parts = text.split(/(@\w[\w\s]*)/g);
  if (parts.length === 1) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        /^@\w/.test(part)
          ? <Text key={i} style={{ color: "#00A884", fontFamily: "Inter_600SemiBold" }}>{part}</Text>
          : part
      )}
    </Text>
  );
}

// Tick icons
function TickIcon({ status, color }: { status: Message["status"]; color: string }) {
  if (status === "read") return <Ionicons name="checkmark-done" size={14} color="#53BDEB" />;
  if (status === "delivered") return <Ionicons name="checkmark-done" size={14} color={color} />;
  return <Ionicons name="checkmark" size={14} color={color} />;
}

// Voice message player
function AudioPlayer({ uri, colors }: { uri: string; colors: any }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const resolvedUriRef = useRef<string | null>(null);

  const resolvePlayableUri = useCallback(async (): Promise<string> => {
    if (resolvedUriRef.current) return resolvedUriRef.current;
    if (!uri.startsWith("data:audio")) {
      resolvedUriRef.current = uri;
      return uri;
    }
    const cacheDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory ?? "";
    if (!cacheDir) throw new Error("No writable cache directory");
    const ext = uri.includes("audio/mpeg") ? "mp3"
      : uri.includes("audio/wav") ? "wav"
      : uri.includes("audio/aac") ? "aac"
      : "m4a";
    const target = `${cacheDir}voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const base64 = uri.replace(/^data:[^;]+;base64,/, "");
    await FileSystem.writeAsStringAsync(target, base64, { encoding: "base64" as any });
    resolvedUriRef.current = target;
    return target;
  }, [uri]);

  const toggle = async () => {
    try {
      if (!sound) {
        setPreparing(true);
        const playableUri = await resolvePlayableUri();
        const { sound: s } = await Audio.Sound.createAsync(
          { uri: playableUri },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded) {
              setPosition(status.positionMillis / 1000);
              setDuration((status.durationMillis ?? 0) / 1000);
              if (status.didJustFinish) { setPlaying(false); setPosition(0); }
            }
          }
        );
        setSound(s);
        setPlaying(true);
        setPreparing(false);
      } else if (playing) {
        await sound.pauseAsync();
        setPlaying(false);
      } else {
        await sound.playAsync();
        setPlaying(true);
      }
    } catch {
      setPreparing(false);
    }
  };

  useEffect(() => () => { sound?.unloadAsync(); }, [sound]);

  const total = duration || 1;
  const prog = Math.min(position / total, 1);
  const secs = Math.round(duration - position);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 180 }}>
      <TouchableOpacity onPress={toggle}>
        <Ionicons name={preparing ? "hourglass-outline" : (playing ? "pause-circle" : "play-circle")} size={36} color={colors.primary} />
      </TouchableOpacity>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.15)" }}>
        <View style={{ width: `${prog * 100}%`, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
      </View>
      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{secs}s</Text>
    </View>
  );
}

export default function ChatScreen() {
  const { id: rawId, name, otherUserId: otherUserIdParam, otherAvatar } = useLocalSearchParams<{
    id?: string; name?: string; otherUserId?: string; otherAvatar?: string;
  }>();

  const {
    chats, user, sendMessage, sendImageMessage, sendAudioMessage,
    setTyping, clearTyping, markAsRead, deleteMessage, deleteForEveryone,
    editMessage, reactToMessage, starMessage, muteChat, createDirectChat,
    loadMessages, forwardMessage,
  } = useApp();

  const [chatId, setChatId] = useState<string | null>(rawId?.startsWith("new_") ? null : rawId ?? null);
  const [initializing, setInitializing] = useState(rawId?.startsWith("new_") ?? false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [typingNames, setTypingNames] = useState<string[]>([]);

  // Search
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Reaction picker
  const [reactionTarget, setReactionTarget] = useState<Message | null>(null);

  // Translation
  const [translatedMsgs, setTranslatedMsgs] = useState<Record<string, string>>({});

  // Forward modal
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);

  // Edit mode
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");

  // Voice recording
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStart, setRecordingStart] = useState(0);
  const recordPressIn = useRef(false);

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    if (!rawId?.startsWith("new_")) return;
    const otherUId = otherUserIdParam ? Number(otherUserIdParam) : Number(rawId.replace("new_", ""));
    if (!otherUId) { setInitializing(false); return; }
    createDirectChat(otherUId, name ?? "Chat", otherAvatar ?? undefined)
      .then((realId) => { setChatId(realId); setInitializing(false); })
      .catch(() => setInitializing(false));
  }, [rawId]);

  useEffect(() => {
    if (!chatId) return;
    markAsRead(chatId);
    loadMessages(chatId);
  }, [chatId]);

  // Poll messages every 4s + typing every 3s
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
  const allMessages = chat?.messages ?? [];
  const messages = searching && searchQuery.trim()
    ? allMessages.filter((m) => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : allMessages;

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyData>(null);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // @mentions state
  const [groupMembers, setGroupMembers] = useState<{ id: number; name: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = not in mention mode

  // Wallpaper
  const [wallpaper, setWallpaper] = useState<string | null>(null);

  // Fetch group members for @mentions
  useEffect(() => {
    if (!chatId || !chat?.isGroup) return;
    fetch(`${BASE_URL}/api/chats/${chatId}/members`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setGroupMembers(d.members.map((m: any) => ({ id: m.id, name: m.name || m.phone }))); })
      .catch(() => {});
  }, [chatId, chat?.isGroup]);

  // Fetch wallpaper for this chat
  useEffect(() => {
    if (!chatId || !user?.dbId) return;
    fetch(`${BASE_URL}/api/chats/${chatId}/wallpaper?userId=${user.dbId}`)
      .then((r) => r.json())
      .then((d) => { if (d.success && d.wallpaper) setWallpaper(d.wallpaper); })
      .catch(() => {});
  }, [chatId, user?.dbId]);

  const handleTextChange = useCallback((val: string) => {
    if (editTarget) { setEditText(val); return; }
    setText(val);
    if (!chatId) return;
    if (val.length > 0) {
      setTyping(chatId);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => { clearTyping(chatId); }, 3000);
    } else {
      clearTyping(chatId);
    }
    // Detect @mention typing
    if (chat?.isGroup) {
      const atIdx = val.lastIndexOf("@");
      if (atIdx !== -1) {
        const afterAt = val.slice(atIdx + 1);
        // Only show if no space after @ (i.e. still typing the name)
        if (!afterAt.includes(" ")) {
          setMentionQuery(afterAt);
          return;
        }
      }
      setMentionQuery(null);
    }
  }, [chatId, setTyping, clearTyping, editTarget, chat?.isGroup]);

  const insertMention = useCallback((memberName: string) => {
    const currentText = editTarget ? editText : text;
    const atIdx = currentText.lastIndexOf("@");
    const newText = currentText.slice(0, atIdx) + `@${memberName} `;
    if (editTarget) setEditText(newText);
    else setText(newText);
    setMentionQuery(null);
    inputRef.current?.focus();
  }, [text, editText, editTarget]);

  const handleSend = useCallback(() => {
    if (!chatId) return;
    if (editTarget) {
      if (!editText.trim()) return;
      editMessage(chatId, editTarget.id, editText.trim());
      setEditTarget(null);
      setEditText("");
      return;
    }
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearTyping(chatId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendMessage(chatId, text.trim(), replyTo?.id);
    setText("");
    setReplyTo(null);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [text, chatId, sendMessage, replyTo, clearTyping, editTarget, editText, editMessage]);

  // Voice recording
  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Microphone permission is required for voice notes.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
      setRecordingStart(Date.now());
      recordPressIn.current = true;
    } catch {}
  };

  const stopRecording = async () => {
    recordPressIn.current = false;
    if (!recording || !chatId) { setIsRecording(false); return; }
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const uri = recording.getURI();
      const duration = (Date.now() - recordingStart) / 1000;
      setRecording(null);
      setIsRecording(false);
      if (uri && duration > 0.5) {
        sendAudioMessage(chatId, uri, duration);
      }
    } catch { setIsRecording(false); }
  };

  const sendMediaMessage = async (type: "camera" | "gallery" | "document" | "location" | "contact" | "viewonce") => {
    if (!chatId) return;
    const isViewOnce = type === "viewonce";

    if (type === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission required", "Camera access is required."); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.75, base64: false });
      if (!result.canceled && result.assets[0]) sendImageMessage(chatId, result.assets[0].uri);

    } else if (type === "gallery" || type === "viewonce") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission required", "Media library access is required."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.75, base64: false });
      if (!result.canceled && result.assets[0]) sendImageMessage(chatId, result.assets[0].uri, undefined, isViewOnce);

    } else if (type === "document") {
      if (Platform.OS === "web") { Alert.alert("Not supported on web", "Use the mobile app to share documents."); return; }
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const fileSizeMB = (asset.size ?? 0) / 1024 / 1024;
      if (fileSizeMB > 16) { Alert.alert("File too large", "Maximum allowed file size is 16MB."); return; }
      try {
        const cacheDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory ?? "";
        if (!cacheDir) throw new Error("No writable cache directory");
        let readableUri = asset.uri;
        try {
          await FileSystem.getInfoAsync(readableUri);
        } catch {
          const ext = asset.name?.split(".").pop() ?? "bin";
          const fallbackPath = `${cacheDir}doc_${Date.now()}.${ext}`;
          await FileSystem.copyAsync({ from: asset.uri, to: fallbackPath });
          readableUri = fallbackPath;
        }
        const base64 = await FileSystem.readAsStringAsync(readableUri, { encoding: "base64" as any });
        const mimeType = asset.mimeType ?? "application/octet-stream";
        const dataUri = `data:${mimeType};base64,${base64}`;
        sendSpecialMessage(chatId, asset.name, "document", dataUri);
      } catch { Alert.alert("Error", "Could not read the selected file. Please try again."); }

    } else if (type === "location") {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission required", "Location access is required to share location."); return; }
      try {
        if (Platform.OS === "android") {
          await Location.enableNetworkProviderAsync().catch(() => {});
        }
        let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!loc) {
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown) loc = lastKnown;
        }
        if (!loc) {
          Alert.alert("Error", "Could not detect your location. Please enable GPS and try again.");
          return;
        }
        const { latitude, longitude } = loc.coords;
        const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
        sendSpecialMessage(chatId, `📍 Location\n${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "location", mapsUrl);
      } catch { Alert.alert("Error", "Could not get your location. Please make sure GPS is enabled."); }

    } else if (type === "contact") {
      if (Platform.OS === "web") { Alert.alert("Not supported on web", "Use the mobile app to share contacts."); return; }
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission required", "Contacts access is required to share contacts."); return; }
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails] });
      if (!data || data.length === 0) { Alert.alert("No contacts", "No contacts were found on this device."); return; }
      // Show simple picker
      const topContacts = data.filter(c => c.name).slice(0, 20);
      const options = topContacts.map(c => ({
        text: `${c.name}${c.phoneNumbers?.[0]?.number ? " — " + c.phoneNumbers[0].number : ""}`,
        onPress: () => {
          const phone = c.phoneNumbers?.[0]?.number ?? "";
          const email = c.emails?.[0]?.email ?? "";
          sendSpecialMessage(chatId, `👤 ${c.name}\n${phone}`, "contact");
        },
      }));
      options.push({ text: "Cancel", onPress: () => {} });
      Alert.alert("Choose a contact", "", options as any);
    }
  };

  const sendSpecialMessage = useCallback((cid: string, text: string, msgType: string, mediaUrl?: string) => {
    const u = user;
    if (u?.dbId) {
      fetch(`${BASE_URL}/api/chats/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: u.dbId, content: text, type: msgType, mediaUrl: mediaUrl ?? null }),
      })
        .then(() => loadMessages(cid))
        .catch(() => {
          Alert.alert("Error", "Failed to send the attachment. Please try again.");
        });
    }
  }, [user, loadMessages]);

  const openDocumentAttachment = useCallback(async (item: Message) => {
    const uri = item.mediaUrl;
    if (!uri) return;
    try {
      const cacheDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory ?? "";
      if (!cacheDir) throw new Error("No writable cache directory");
      if (uri.startsWith("data:")) {
        const mimeMatch = uri.match(/^data:([^;]+);base64,/);
        const base64 = uri.replace(/^data:[^;]+;base64,/, "");
        const mime = mimeMatch?.[1] ?? "application/octet-stream";
        const extMap: Record<string, string> = {
          "application/pdf": "pdf",
          "application/vnd.ms-excel": "xls",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
          "application/msword": "doc",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
          "text/plain": "txt",
        };
        const ext = extMap[mime] ?? "bin";
        const safeName = (item.text || `document_${Date.now()}`).replace(/[^\w.-]/g, "_");
        const fileUri = `${cacheDir}${safeName}.${ext}`;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: "base64" as any });
        await Linking.openURL(fileUri);
      } else {
        await Linking.openURL(uri);
      }
    } catch {
      Alert.alert("Error", "Could not open this document on your device.");
    }
  }, []);

  const [attachVisible, setAttachVisible] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ uri: string; caption?: string; type: "image" | "video" } | null>(null);
  const showAttachMenu = () => setAttachVisible(true);

  const longPressMsg = (msg: Message) => {
    if (msg.type === "deleted") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isMe = msg.senderId === "me";

    const opts: any[] = [
      { text: "↩ Reply", onPress: () => { setReplyTo({ id: msg.id, text: msg.text, senderId: msg.senderId, senderName: msg.senderName }); inputRef.current?.focus(); } },
      { text: "📋 Copy", onPress: () => { Clipboard.setString(msg.text); } },
      { text: "😊 React", onPress: () => setReactionTarget(msg) },
      { text: "↗ Forward", onPress: () => setForwardMsg(msg) },
      { text: "⭐ Star", onPress: () => { if (chatId) starMessage(chatId, msg.id); } },
      { text: "🌐 Translate", onPress: () => Alert.alert("Translate to:", "", [
          { text: "हिंदी (Hindi)", onPress: () => translateMsg(msg, "hi") },
          { text: "English", onPress: () => translateMsg(msg, "en") },
          { text: "বাংলা (Bengali)", onPress: () => translateMsg(msg, "bn") },
          { text: "தமிழ் (Tamil)", onPress: () => translateMsg(msg, "ta") },
          { text: "తెలుగు (Telugu)", onPress: () => translateMsg(msg, "te") },
          { text: "मराठी (Marathi)", onPress: () => translateMsg(msg, "mr") },
          { text: "Cancel", style: "cancel" },
        ]) },
    ];
    if (isMe) {
      opts.push({ text: "ℹ️ Info", onPress: () => router.push({ pathname: "/chat/message-info", params: { chatId: chatId!, messageId: msg.id } }) });
      opts.push({ text: "✏️ Edit", onPress: () => { setEditTarget(msg); setEditText(msg.text); inputRef.current?.focus(); } });
      opts.push({
        text: "🗑 Delete for me",
        onPress: () => Alert.alert("Delete", "Delete for you only?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete for me", onPress: () => { if (chatId) deleteMessage(chatId, msg.id); } },
        ]),
      });
      opts.push({
        text: "🚫 Delete for everyone",
        style: "destructive" as const,
        onPress: () => Alert.alert("Delete for everyone", "Message will be deleted for all. This cannot be undone.", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete for everyone", style: "destructive", onPress: () => { if (chatId) deleteForEveryone(chatId, msg.id); } },
        ]),
      });
    }
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Message", "", opts);
  };

  const translateMsg = useCallback(async (msg: Message, toLang: string) => {
    if (!msg.text?.trim()) return;
    try {
      const r = await fetch(`${BASE_URL}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: msg.text, to: toLang }),
      });
      const d = await r.json();
      if (d.success) {
        setTranslatedMsgs(prev => ({ ...prev, [msg.id]: d.translated }));
      } else {
        Alert.alert("Translation failed", "Translate nahi ho saka. Dobara try karo.");
      }
    } catch {
      Alert.alert("Error", "Network error");
    }
  }, []);

  const renderMsg = ({ item }: { item: Message }) => {
    const isMe = item.senderId === "me";
    const isDeleted = item.type === "deleted";
    const isImage = (item.type === "image" || item.type === "video") && !!item.mediaUrl;
    const isAudio = item.type === "audio" && !!item.mediaUrl;
    const isDocument = item.type === "document";
    const isLocation = item.type === "location";
    const isContact = item.type === "contact";
    const isSpecial = isDocument || isLocation || isContact;
    const urls = (!isDeleted && !isImage && !isAudio && !isSpecial) ? extractUrls(item.text) : [];
    const isManyForwarded = (item.forwardCount ?? 0) >= 5;

    // Group reactions by emoji
    const reactionGroups: Record<string, { count: number; mine: boolean }> = {};
    (item.reactions ?? []).forEach((r) => {
      if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = { count: 0, mine: false };
      reactionGroups[r.emoji].count++;
      if (r.userId === user?.dbId) reactionGroups[r.emoji].mine = true;
    });
    const hasReactions = Object.keys(reactionGroups).length > 0;

    return (
      <TouchableOpacity
        onLongPress={() => longPressMsg(item)}
        activeOpacity={0.88}
        style={[styles.msgWrap, isMe ? styles.msgRight : styles.msgLeft]}
      >
        {/* Forwarded label */}
        {item.isForwarded && !isDeleted && (
          <View style={[styles.fwdLabel, isMe ? { alignSelf: "flex-end" } : {}]}>
            <Ionicons name="arrow-redo-outline" size={11} color={colors.mutedForeground} />
            <Text style={[styles.fwdText, { color: colors.mutedForeground }]}>
              {isManyForwarded ? " Forwarded many times" : " Forwarded"}
            </Text>
          </View>
        )}

        <View
          style={[
            styles.bubble,
            { backgroundColor: isMe ? colors.chatBubbleSent : colors.chatBubbleReceived },
            isDeleted && { opacity: 0.55 },
            isImage && styles.bubbleImg,
          ]}
        >
          {/* Reply strip */}
          {item.replyToId && item.replyText && (
            <View style={[styles.replyStrip, { borderLeftColor: colors.primary, backgroundColor: isMe ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.07)" }]}>
              <Text style={[styles.replyWho, { color: colors.primary }]}>
                {item.replySenderName ?? (item.replyToId === "me" ? "You" : "Them")}
              </Text>
              <Text style={[styles.replyText, { color: colors.mutedForeground }]} numberOfLines={1}>{item.replyText}</Text>
            </View>
          )}

          {/* Content */}
          {isDeleted ? (
            <View style={styles.deletedRow}>
              <Ionicons name="ban-outline" size={13} color={colors.mutedForeground} />
              <Text style={[styles.deletedText, { color: colors.mutedForeground }]}> This message was deleted</Text>
            </View>
          ) : isImage ? (
            <>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  if (!item.mediaUrl) return;
                  if (item.type === "video") {
                    Linking.openURL(item.mediaUrl).catch(() => {});
                    return;
                  }
                  setMediaPreview({
                    uri: item.mediaUrl,
                    type: "image",
                    caption: item.text && item.text !== "📷 Photo" && item.text !== "🎥 Video" && item.text !== "🔁 View once"
                      ? item.text
                      : undefined,
                  });
                }}
              >
                <Image source={{ uri: item.mediaUrl }} style={styles.msgImage} contentFit="cover" />
              </TouchableOpacity>
              {item.isViewOnce && (
                <View style={styles.viewOnceOverlay}>
                  <Ionicons name="eye-outline" size={18} color="#fff" />
                  <Text style={styles.viewOnceText}>View once</Text>
                </View>
              )}
              {item.text && item.text !== "📷 Photo" && item.text !== "🎥 Video" && item.text !== "🔁 View once" && (
                <Text style={[styles.msgText, { color: colors.foreground, paddingHorizontal: 8, paddingTop: 4 }]}>{item.text}</Text>
              )}
            </>
          ) : isAudio ? (
            <AudioPlayer uri={item.mediaUrl!} colors={colors} />
          ) : isDocument ? (
            <TouchableOpacity
              style={styles.docCard}
              onPress={() => { void openDocumentAttachment(item); }}
              activeOpacity={0.8}
            >
              <View style={[styles.docIcon, { backgroundColor: isMe ? "rgba(255,255,255,0.2)" : "#00A88420" }]}>
                <Ionicons name="document-text" size={28} color={isMe ? "#fff" : "#00A884"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docName, { color: colors.foreground }]} numberOfLines={2}>{item.text}</Text>
                <Text style={[styles.docMeta, { color: colors.mutedForeground }]}>Document • Tap to open</Text>
              </View>
              <Ionicons name="download-outline" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : isLocation ? (
            <TouchableOpacity
              style={styles.locationCard}
              onPress={() => item.mediaUrl && Linking.openURL(item.mediaUrl).catch(() => {})}
              activeOpacity={0.8}
            >
              <View style={styles.locationMapPreview}>
                <Ionicons name="map" size={40} color="#00A884" />
                <View style={styles.locationPin}>
                  <Ionicons name="location" size={22} color="#E74C3C" />
                </View>
              </View>
              <View style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={[styles.locationLabel, { color: colors.foreground }]}>📍 Live Location</Text>
                <Text style={[styles.locationCoords, { color: colors.mutedForeground }]}>
                  {item.text.replace("📍 Location\n", "")}
                </Text>
                <Text style={[styles.locationOpen, { color: colors.primary }]}>Google Maps mein open karo ↗</Text>
              </View>
            </TouchableOpacity>
          ) : isContact ? (
            <View style={styles.contactCard}>
              <View style={styles.contactCardAvatar}>
                <Text style={styles.contactCardAvatarTxt}>
                  {(item.text.split("\n")[0].replace("👤 ", "") || "?")[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactCardName, { color: colors.foreground }]}>
                  {item.text.split("\n")[0].replace("👤 ", "")}
                </Text>
                {item.text.split("\n")[1] ? (
                  <Text style={[styles.contactCardPhone, { color: colors.mutedForeground }]}>
                    {item.text.split("\n")[1]}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => {
                  const phone = item.text.split("\n")[1];
                  if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
                }}
                style={styles.contactCallBtn}
              >
                <Ionicons name="call" size={18} color="#00A884" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <MentionText text={item.text} style={[styles.msgText, { color: colors.foreground }]} />
              {urls.length > 0 && (
                <TouchableOpacity onPress={() => Linking.openURL(urls[0])} style={styles.linkPreview}>
                  <Ionicons name="link-outline" size={13} color={colors.primary} />
                  <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>{urls[0]}</Text>
                </TouchableOpacity>
              )}
              {translatedMsgs[item.id] && (
                <View style={styles.translatedBox}>
                  <Text style={styles.translatedLabel}>🌐 Translated</Text>
                  <Text style={[styles.msgText, { color: colors.foreground }]}>{translatedMsgs[item.id]}</Text>
                </View>
              )}
            </>
          )}

          {/* Meta: time + edited + ticks */}
          <View style={[styles.msgMeta, isImage && { paddingHorizontal: 8, paddingBottom: 4 }]}>
            {item.isEdited && <Text style={[styles.editedLabel, { color: colors.mutedForeground }]}>edited </Text>}
            <Text style={[styles.msgTime, { color: isImage ? "rgba(255,255,255,0.85)" : colors.mutedForeground }]}>
              {formatFullTime(item.timestamp)}
            </Text>
            {isMe && !isDeleted && (
              <TickIcon status={item.status} color={isImage ? "rgba(255,255,255,0.85)" : colors.mutedForeground} />
            )}
          </View>
        </View>

        {/* Reactions */}
        {hasReactions && (
          <View style={[styles.reactionsRow, isMe ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
            {Object.entries(reactionGroups).map(([emoji, { count, mine }]) => (
              <TouchableOpacity
                key={emoji}
                style={[styles.reactionChip, mine && { borderColor: colors.primary, borderWidth: 1 }, { backgroundColor: colors.card }]}
                onPress={() => chatId && reactToMessage(chatId, item.id, emoji)}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 1 && <Text style={[styles.reactionCount, { color: colors.foreground }]}>{count}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const displayName = name ?? chat?.name ?? "Chat";
  const initials = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = (displayName.charCodeAt(0) * 37) % 360;
  const avatarBg = `hsl(${hue},50%,40%)`;
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const pickWallpaper = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const dataUri = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
    setWallpaper(dataUri);
    if (chatId && user?.dbId) {
      fetch(`${BASE_URL}/api/chats/${chatId}/wallpaper`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.dbId, wallpaper: dataUri }),
      }).catch(() => {});
    }
  }, [chatId, user?.dbId]);

  const removeWallpaper = useCallback(() => {
    setWallpaper(null);
    if (chatId && user?.dbId) {
      fetch(`${BASE_URL}/api/chats/${chatId}/wallpaper`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.dbId, wallpaper: null }),
      }).catch(() => {});
    }
  }, [chatId, user?.dbId]);

  const chatMenuItems = [
    { label: "Chat info", icon: "information-circle-outline", onPress: () => chatId && router.push({ pathname: "/chat-info/[id]", params: { id: chatId, name: displayName } }) },
    { label: "Starred messages", icon: "star-outline", onPress: () => router.push("/starred") },
    { label: "Wallpaper", icon: "image-outline", onPress: () => Alert.alert("Chat wallpaper", "", [
        { text: "Choose photo", onPress: pickWallpaper },
        ...(wallpaper ? [{ text: "Remove wallpaper", style: "destructive" as const, onPress: removeWallpaper }] : []),
        { text: "Cancel", style: "cancel" as const },
      ]) },
    { label: "Schedule Message ⏰", icon: "time-outline", onPress: () => chatId && router.push({ pathname: "/scheduled/[chatId]", params: { chatId, name: displayName } }) },
    { label: "Khata / Udhar 💰", icon: "cash-outline", onPress: () => chatId && router.push({ pathname: "/khata/[chatId]", params: { chatId, name: displayName } }) },
    { label: "Mute notifications", icon: "notifications-off-outline", onPress: () => chatId && muteChat(chatId) },
    { label: "Search", icon: "search-outline", onPress: () => { setSearching(true); setSearchQuery(""); } },
  ];

  const inputVal = editTarget ? editText : text;

  // Filter members for mention autocomplete
  const mentionResults = mentionQuery !== null
    ? groupMembers.filter((m) => m.name.toLowerCase().startsWith(mentionQuery.toLowerCase()) && m.id !== user?.dbId)
    : [];

  return (
    <View style={[styles.container, { backgroundColor: wallpaper ? "transparent" : colors.chatBackground }]}>
      {/* Wallpaper background */}
      {wallpaper && (
        <Image
          source={{ uri: wallpaper }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          blurRadius={wallpaper.startsWith("data:") ? 0 : 0}
        />
      )}
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.headerBg, paddingTop: topPad }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerAvatarWrap}>
          {chat?.avatar || otherAvatar ? (
            <Image source={{ uri: chat?.avatar || otherAvatar }} style={styles.headerAvatarImg} contentFit="cover" />
          ) : (
            <View style={[styles.headerAvatarWrap, { backgroundColor: avatarBg }]}>
              <Text style={styles.headerAvatarText}>{initials}</Text>
            </View>
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
                ? `${chat.members?.length ?? ""} members`
                : initializing ? "connecting..." : chat?.isOnline ? "online" : "tap for info"}
          </Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {!searching && (
            <>
              <TouchableOpacity style={styles.headerBtn} onPress={() => chatId && router.push({ pathname: "/call/[id]", params: { id: chatId, type: "video", name: displayName } })}>
                <Ionicons name="videocam-outline" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={() => chatId && router.push({ pathname: "/call/[id]", params: { id: chatId, type: "audio", name: displayName } })}>
                <Ionicons name="call-outline" size={22} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerBtn} onPress={() => setMenuOpen(true)}>
                <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
              </TouchableOpacity>
            </>
          )}
          {searching && (
            <TouchableOpacity style={styles.headerBtn} onPress={() => { setSearching(false); setSearchQuery(""); }}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <DropdownMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={chatMenuItems}
        topOffset={topPad + 46}
      />

      {/* Search bar */}
      {searching && (
        <View style={[styles.searchBar, { backgroundColor: colors.card }]}>
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            autoFocus
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search messages..."
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMsg}
          contentContainerStyle={{ paddingVertical: 10, paddingHorizontal: 8 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => !searching && listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            initializing ? (
              <View style={styles.initWrap}>
                <Text style={[styles.initText, { color: colors.mutedForeground }]}>Starting chat...</Text>
              </View>
            ) : searching ? (
              <View style={styles.initWrap}>
                <Text style={[styles.initText, { color: colors.mutedForeground }]}>No messages found</Text>
              </View>
            ) : null
          }
        />

        {/* @Mention autocomplete */}
        {mentionResults.length > 0 && mentionQuery !== null && (
          <View style={[styles.mentionList, { backgroundColor: colors.card }]}>
            {mentionResults.slice(0, 6).map((m) => {
              const mInitials = m.name.slice(0, 2).toUpperCase();
              const mHue = (m.name.charCodeAt(0) * 37) % 360;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.mentionRow, { borderBottomColor: colors.border }]}
                  onPress={() => insertMention(m.name)}
                >
                  <View style={[styles.mentionAvatar, { backgroundColor: `hsl(${mHue},50%,40%)` }]}>
                    <Text style={styles.mentionAvatarText}>{mInitials}</Text>
                  </View>
                  <Text style={[styles.mentionName, { color: colors.foreground }]}>@{m.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Edit mode banner */}
        {editTarget && (
          <View style={[styles.editBanner, { backgroundColor: colors.card, borderLeftColor: colors.primary }]}>
            <Ionicons name="pencil-outline" size={16} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.editBannerLabel, { color: colors.primary }]}>Editing message</Text>
              <Text style={[styles.editBannerText, { color: colors.mutedForeground }]} numberOfLines={1}>{editTarget.text}</Text>
            </View>
            <TouchableOpacity onPress={() => { setEditTarget(null); setEditText(""); }}>
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Reply preview */}
        {replyTo && !editTarget && (
          <View style={[styles.replyPreview, { backgroundColor: colors.card, borderLeftColor: colors.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.replyPreviewLabel, { color: colors.primary }]}>
                {replyTo.senderId === "me" ? "You" : (replyTo.senderName ?? displayName)}
              </Text>
              <Text style={[styles.replyPreviewText, { color: colors.mutedForeground }]} numberOfLines={1}>{replyTo.text}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        )}

        {/* Recording indicator */}
        {isRecording && (
          <View style={[styles.recordingBar, { backgroundColor: colors.card }]}>
            <View style={styles.recordingDot} />
            <Text style={[styles.recordingText, { color: colors.foreground }]}>Recording voice message... Release to send</Text>
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
            placeholder={editTarget ? "Edit message..." : "Message"}
            placeholderTextColor={colors.mutedForeground}
            value={inputVal}
            onChangeText={handleTextChange}
            multiline
            maxLength={2000}
            editable={!initializing}
          />
          {!inputVal.trim() && (
            <TouchableOpacity style={styles.inputIcon} onPress={showAttachMenu}>
              <Ionicons name="attach-outline" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          {!inputVal.trim() && (
            <TouchableOpacity style={styles.inputIcon} onPress={() => sendMediaMessage("camera")}>
              <Ionicons name="camera-outline" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          {inputVal.trim() ? (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.primary }, initializing && { opacity: 0.5 }]}
              disabled={initializing}
              onPress={handleSend}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: isRecording ? "#ef4444" : colors.primary }]}
              onPressIn={startRecording}
              onPressOut={stopRecording}
              delayLongPress={200}
            >
              <Ionicons name={isRecording ? "stop" : "mic-outline"} size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Attach menu modal */}
      <Modal visible={attachVisible} transparent animationType="slide" onRequestClose={() => setAttachVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAttachVisible(false)}>
          <View style={[styles.attachSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.attachTitle, { color: colors.foreground }]}>Share</Text>
            <View style={styles.attachGrid}>
              {[
                { icon: "image-outline", label: "Gallery", onPress: () => { setAttachVisible(false); sendMediaMessage("gallery"); } },
                { icon: "eye-outline", label: "View once", onPress: () => { setAttachVisible(false); sendMediaMessage("viewonce"); } },
                { icon: "document-outline", label: "Document", onPress: () => { setAttachVisible(false); sendMediaMessage("document"); } },
                { icon: "location-outline", label: "Location", onPress: () => { setAttachVisible(false); sendMediaMessage("location"); } },
                { icon: "person-outline", label: "Contact", onPress: () => { setAttachVisible(false); sendMediaMessage("contact"); } },
              ].map((item) => (
                <TouchableOpacity key={item.label} style={[styles.attachItem, { backgroundColor: colors.background }]} onPress={item.onPress}>
                  <Ionicons name={item.icon as any} size={28} color={colors.primary} />
                  <Text style={[styles.attachLabel, { color: colors.foreground }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Reaction picker modal */}
      <Modal visible={!!reactionTarget} transparent animationType="fade" onRequestClose={() => setReactionTarget(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setReactionTarget(null)}>
          <View style={[styles.reactionPicker, { backgroundColor: colors.card }]}>
            {REACTION_EMOJIS.map((e) => (
              <TouchableOpacity key={e} style={styles.reactionPickerBtn} onPress={() => {
                if (chatId && reactionTarget) { reactToMessage(chatId, reactionTarget.id, e); }
                setReactionTarget(null);
              }}>
                <Text style={{ fontSize: 28 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Forward modal */}
      <Modal visible={!!forwardMsg} transparent animationType="slide" onRequestClose={() => setForwardMsg(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setForwardMsg(null)}>
          <View style={[styles.forwardSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.attachTitle, { color: colors.foreground }]}>Forward to</Text>
            <ScrollView>
              {chats.map((c) => (
                <TouchableOpacity key={c.id} style={styles.forwardRow} onPress={() => {
                  if (chatId && forwardMsg) { forwardMessage(chatId, forwardMsg.id, c.id); }
                  setForwardMsg(null);
                  Alert.alert("Forwarded", `Message forwarded to ${c.name}`);
                }}>
                  <View style={[styles.forwardAvatar, { backgroundColor: `hsl(${(c.name.charCodeAt(0) * 37) % 360},50%,40%)` }]}>
                    {c.avatar ? <Image source={{ uri: c.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" /> : (
                      <Text style={{ color: "#fff", fontFamily: "Inter_700Bold" }}>{c.name[0]?.toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={[styles.forwardName, { color: colors.foreground }]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!mediaPreview} animationType="fade" transparent onRequestClose={() => setMediaPreview(null)}>
        <View style={styles.mediaPreviewModal}>
          <View style={styles.mediaPreviewHeader}>
            <TouchableOpacity style={styles.mediaPreviewBtn} onPress={() => setMediaPreview(null)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          {mediaPreview?.uri ? (
            <Image source={{ uri: mediaPreview.uri }} style={styles.mediaPreviewImage} contentFit="contain" />
          ) : null}
          {mediaPreview?.caption ? (
            <View style={styles.mediaPreviewCaptionWrap}>
              <Text style={styles.mediaPreviewCaption}>{mediaPreview.caption}</Text>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // @mention autocomplete
  mentionList: { borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.1)", maxHeight: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4 },
  mentionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12, borderBottomWidth: 0.5 },
  mentionAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  mentionAvatarText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  mentionName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
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
  searchBar: { flexDirection: "row", alignItems: "center", margin: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  initWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, marginTop: 80 },
  initText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  msgWrap: { marginVertical: 2 },
  msgLeft: { alignItems: "flex-start" },
  msgRight: { alignItems: "flex-end" },
  fwdLabel: { flexDirection: "row", alignItems: "center", marginBottom: 2, paddingHorizontal: 4 },
  fwdText: { fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  bubble: {
    maxWidth: "82%", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7,
    elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2,
  },
  bubbleImg: { paddingHorizontal: 0, paddingVertical: 0, overflow: "hidden" },
  replyStrip: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 5, paddingVertical: 2, borderRadius: 2, marginHorizontal: 0 },
  replyWho: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  replyText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  msgText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  msgImage: { width: W * 0.62, height: W * 0.62, borderRadius: 10 },
  viewOnceOverlay: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  viewOnceText: { color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" },
  translatedBox: { marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.15)" },
  translatedLabel: { fontSize: 10, color: "#00A884", fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  docCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, minWidth: 220 },
  docIcon: { width: 48, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  docMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  locationCard: { overflow: "hidden", minWidth: 220 },
  locationMapPreview: { height: 120, backgroundColor: "#1a2332", alignItems: "center", justifyContent: "center", position: "relative" },
  locationPin: { position: "absolute" },
  locationLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  locationCoords: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 4 },
  locationOpen: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  contactCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, minWidth: 220, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.1)" },
  contactCardAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#00A88440", alignItems: "center", justifyContent: "center" },
  contactCardAvatarTxt: { color: "#00A884", fontSize: 18, fontWeight: "700" },
  contactCardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  contactCardPhone: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  contactCallBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#00A88420", alignItems: "center", justifyContent: "center" },
  linkPreview: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.1)" },
  linkText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  msgMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 3 },
  editedLabel: { fontSize: 10, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  msgTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  deletedRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  deletedText: { fontSize: 14, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  reactionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2, marginHorizontal: 4 },
  reactionChip: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 0.5, borderColor: "transparent" },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontFamily: "Inter_500Medium" },
  editBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderLeftWidth: 3, marginHorizontal: 8, marginBottom: 4, borderRadius: 4, gap: 4 },
  editBannerLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  editBannerText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  replyPreview: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderLeftWidth: 3, marginHorizontal: 8, marginBottom: 4, borderRadius: 4 },
  replyPreviewLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  replyPreviewText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  recordingBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 10, marginHorizontal: 8, borderRadius: 8, marginBottom: 4 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#ef4444" },
  recordingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingTop: 8, gap: 4 },
  inputIcon: { padding: 6 },
  inputField: { flex: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  attachSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  attachTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 16, textAlign: "center" },
  attachGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  attachItem: { alignItems: "center", justifyContent: "center", width: 80, height: 80, borderRadius: 16, gap: 6 },
  attachLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  reactionPicker: { alignSelf: "center", flexDirection: "row", gap: 8, borderRadius: 40, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 200, elevation: 10, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  reactionPickerBtn: { padding: 4 },
  forwardSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "60%" },
  forwardRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  forwardAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  forwardName: { fontSize: 15, fontFamily: "Inter_500Medium", flex: 1 },
  mediaPreviewModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.98)" },
  mediaPreviewHeader: { paddingTop: 46, paddingHorizontal: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center" },
  mediaPreviewBtn: { padding: 8 },
  mediaPreviewImage: { flex: 1, width: "100%" },
  mediaPreviewCaptionWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 20, backgroundColor: "rgba(0,0,0,0.55)" },
  mediaPreviewCaption: { color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "left" },
});
