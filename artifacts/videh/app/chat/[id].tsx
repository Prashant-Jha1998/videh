import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import * as Contacts from "expo-contacts";
import type { ExistingContact } from "expo-contacts";
import { Audio, ResizeMode, Video } from "expo-av";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { useColors } from "@/hooks/useColors";
import { useApp, type Message } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";
import { usePlayableVideoUri } from "@/lib/usePlayableVideoUri";
import { formatChatBubbleTime } from "@/utils/time";
import { DismissibleModal } from "@/components/DismissibleModal";
import { DropdownMenu } from "@/components/DropdownMenu";
import {
  encodeLocationPayload,
  formatLiveUntil,
  mapsUrl,
  parseLegacyLocation,
  parseLocationPayload,
  staticMapImageUrl,
} from "@/lib/locationMessage";
import { loadEnterIsSend } from "@/lib/chatSettings";
import Svg, { Path } from "react-native-svg";

const BASE_URL = getApiUrl();
const { width: W } = Dimensions.get("window");
const REACTION_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];
const REPLY_SWIPE_ACTION_W = 56;

const MIME_EXTENSION_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function safeFileName(name: string, fallback: string, ext: string) {
  const cleaned = (name || fallback).replace(/[^\w.-]/g, "_").replace(/^_+|_+$/g, "");
  if (!cleaned) return `${fallback}.${ext}`;
  return cleaned.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? cleaned : `${cleaned}.${ext}`;
}

type ChatListRow =
  | { rowType: "date"; id: string; label: string }
  | { rowType: "msg"; message: Message };

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** WhatsApp-style strip labels: Today, Yesterday, weekday, then dated. */
function formatDateChipLabel(ts: number, nowMs = Date.now()): string {
  const dayMs = 86400000;
  const d0 = startOfLocalDay(ts);
  const t0 = startOfLocalDay(nowMs);
  const diffDays = Math.round((t0 - d0) / dayMs);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays >= 2 && diffDays < 7) {
    return new Date(ts).toLocaleDateString(undefined, { weekday: "long" });
  }
  const y = new Date(ts).getFullYear();
  const cy = new Date(nowMs).getFullYear();
  if (y === cy) {
    return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function messagesWithDateRows(msgs: Message[]): ChatListRow[] {
  const out: ChatListRow[] = [];
  let prevDay: number | null = null;
  for (const m of msgs) {
    const day = startOfLocalDay(m.timestamp);
    if (prevDay === null || day !== prevDay) {
      out.push({
        rowType: "date",
        id: `date-${day}`,
        label: formatDateChipLabel(m.timestamp),
      });
      prevDay = day;
    }
    out.push({ rowType: "msg", message: m });
  }
  return out;
}

/** Small filled tail under the bubble corner (flat SVG, WhatsApp-ish). */
function ChatBubbleTail({ fill, side }: { fill: string; side: "left" | "right" }) {
  const w = 7;
  const h = 10;
  const rightD = "M0 2 C0 0.5 1.5 0 3.5 1 C5.5 2.2 7 5.5 7 9.5 L7 10 L0 10 Z";
  const leftD = "M7 2 C7 0.5 5.5 0 3.5 1 C1.5 2.2 0 5.5 0 9.5 L0 10 L7 10 Z";
  return (
    <Svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={[styles.bubbleTailSvg, side === "right" ? { right: -0.5 } : { left: -0.5 }]}
      pointerEvents="none"
    >
      <Path d={side === "right" ? rightD : leftD} fill={fill} />
    </Svg>
  );
}

type ContactShareRow = { id: string; name: string; phone: string };

function buildContactShareRows(data: ExistingContact[]): ContactShareRow[] {
  const out: ContactShareRow[] = [];
  for (const c of data) {
    const nameRaw = (c.name ?? "").trim();
    const phones = (c.phoneNumbers ?? [])
      .map((p) => (p.number ?? "").trim())
      .filter(Boolean);
    if (!nameRaw && phones.length === 0) continue;
    const displayName = nameRaw || phones[0]!;
    const primaryPhone = phones[0] ?? "";
    out.push({ id: String(c.id), name: displayName, phone: primaryPhone });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return out;
}

async function loadAllDeviceContactsForShare(): Promise<ExistingContact[]> {
  const fields = [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails];
  const aggregated: ExistingContact[] = [];
  let pageOffset = 0;
  const pageSize = 500;
  for (let guard = 0; guard < 200; guard++) {
    const res = await Contacts.getContactsAsync({
      fields,
      pageSize,
      pageOffset,
      sort: Contacts.SortTypes.FirstName,
    });
    aggregated.push(...res.data);
    if (!res.hasNextPage) break;
    pageOffset += res.data.length;
  }
  return aggregated;
}

/** WhatsApp-style attachment row (coloured circle + label). Order matches common WA layout. */
const ATTACH_SHEET_ITEMS: {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  color: string;
  type: "document" | "camera" | "gallery" | "audiofile" | "location" | "contact";
}[] = [
  { key: "doc", icon: "document-text", label: "Document", color: "#8B5CF6", type: "document" },
  { key: "cam", icon: "camera", label: "Camera", color: "#E8558D", type: "camera" },
  { key: "gal", icon: "images", label: "Gallery", color: "#2F80ED", type: "gallery" },
  { key: "aud", icon: "musical-notes", label: "Audio", color: "#F2A742", type: "audiofile" },
  { key: "loc", icon: "location", label: "Location", color: "#25D366", type: "location" },
  { key: "con", icon: "person", label: "Contact", color: "#1296D4", type: "contact" },
];

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

const VOICE_NOTE_WAVE_BARS = 26;

function parseVoiceDurationSec(text: string): number {
  const m = text.match(/Voice message\s*\((\d+)s\)/i) ?? text.match(/\((\d+)\s*s\)/i);
  return m ? Number(m[1]) : 0;
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function voiceWaveHeights(seed: string, count: number): number[] {
  let h = hashSeed(seed || "0");
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h << 13), 1274126177) >>> 0;
    out.push(0.28 + ((h % 1000) / 1000) * 0.72);
  }
  return out;
}

function formatVoiceClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** WhatsApp-style voice note: waveform, scrub, 1x / 1.5x / 2x, optional avatar on sent notes */
function VoiceNotePlayer({
  uri,
  colors,
  isMe,
  messageId,
  durationHintSec,
  avatarUri,
}: {
  uri: string;
  colors: ReturnType<typeof useColors>;
  isMe: boolean;
  messageId: string;
  durationHintSec: number;
  avatarUri?: string;
}) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(Math.max(0.1, durationHintSec || 0.1));
  const [position, setPosition] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [rate, setRate] = useState(1);
  const [waveW, setWaveW] = useState(0);
  const resolvedUriRef = useRef<string | null>(null);
  const bars = useMemo(() => voiceWaveHeights(messageId + uri.slice(-24), VOICE_NOTE_WAVE_BARS), [messageId, uri]);

  const resolvePlayableUri = useCallback(async (): Promise<string> => {
    if (resolvedUriRef.current) return resolvedUriRef.current;
    if (!uri.startsWith("data:audio")) {
      resolvedUriRef.current = uri;
      return uri;
    }
    const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
    if (!cacheDir) throw new Error("No writable cache directory");
    const ext = uri.includes("audio/mpeg") ? "mp3"
      : uri.includes("audio/wav") ? "wav"
      : uri.includes("audio/aac") ? "aac"
      : "m4a";
    const target = `${cacheDir}voice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const base64 = uri.replace(/^data:[^;]+;base64,/, "");
    await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
    resolvedUriRef.current = target;
    return target;
  }, [uri]);

  const applyRate = useCallback(async (s: Audio.Sound, next: number) => {
    try {
      await s.setRateAsync(next, true);
    } catch { /* older platforms */ }
  }, []);

  const toggle = async () => {
    try {
      if (!sound) {
        setPreparing(true);
        const playableUri = await resolvePlayableUri();
        const { sound: s } = await Audio.Sound.createAsync(
          { uri: playableUri },
          { shouldPlay: true, rate: 1 },
          (status) => {
            if (status.isLoaded) {
              setPosition((status.positionMillis ?? 0) / 1000);
              const d = (status.durationMillis ?? 0) / 1000;
              if (d > 0.05) setDuration(d);
              if (status.didJustFinish) { setPlaying(false); setPosition(0); }
            }
          }
        );
        await applyRate(s, rate);
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

  const cycleRate = async () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (sound) await applyRate(sound, next);
  };

  const seekFromX = async (x: number) => {
    if (!sound || waveW <= 0 || duration <= 0) return;
    const p = Math.max(0, Math.min(1, x / waveW));
    try {
      await sound.setPositionAsync(p * duration * 1000);
      setPosition(p * duration);
    } catch { /* ignore */ }
  };

  useEffect(() => () => { void sound?.unloadAsync(); }, [sound]);

  useEffect(() => {
    if (!sound) return;
    void applyRate(sound, rate);
  }, [sound, rate, applyRate]);

  const total = Math.max(duration, 0.1);
  const prog = Math.min(Math.max(position / total, 0), 1);
  const remaining = Math.max(0, total - position);
  const inactiveBar = isMe ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.18)";
  const activeBar = isMe ? "rgba(0,0,0,0.45)" : "#5a6a72";
  const scrubLeft = waveW > 0 ? prog * waveW - 4 : 0;

  return (
    <View style={{ minWidth: 240, maxWidth: W * 0.78, paddingVertical: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {isMe ? (
          <View style={{ width: 36, alignItems: "center", justifyContent: "center" }}>
            <View style={{ position: "relative" }}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" />
              ) : (
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#00A884", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person" size={18} color="#fff" />
                </View>
              )}
              <View style={{
                position: "absolute",
                right: -2,
                bottom: -2,
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: "#00A884",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: isMe ? colors.chatBubbleSent : colors.chatBubbleReceived,
              }}
              >
                <Ionicons name="mic" size={9} color="#fff" />
              </View>
            </View>
          </View>
        ) : null}
        <TouchableOpacity
          onPress={() => { void toggle(); }}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: isMe ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.92)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {preparing ? (
            <Ionicons name="hourglass-outline" size={20} color="#333" />
          ) : (
            <Ionicons name={playing ? "pause" : "play"} size={22} color="#333" style={{ marginLeft: playing ? 0 : 2 }} />
          )}
        </TouchableOpacity>
        <Pressable
          style={{ flex: 1, height: 36, justifyContent: "center" }}
          onLayout={(e) => setWaveW(e.nativeEvent.layout.width)}
          onPress={(e) => { void seekFromX(e.nativeEvent.locationX); }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: 32, gap: 2 }}>
            {bars.map((h, i) => {
              const filled = i / bars.length <= prog;
              return (
                <View
                  key={i}
                  style={{
                    width: 2.5,
                    height: 6 + h * 22,
                    borderRadius: 1,
                    backgroundColor: filled ? activeBar : inactiveBar,
                  }}
                />
              );
            })}
          </View>
          {waveW > 0 ? (
            <View
              style={{
                position: "absolute",
                left: Math.max(0, Math.min(waveW - 8, scrubLeft)),
                top: 10,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#2095F2",
              }}
            />
          ) : null}
        </Pressable>
        <TouchableOpacity
          onPress={() => { void cycleRate(); }}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: isMe ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.15)",
          }}
        >
          <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: isMe ? "rgba(0,0,0,0.65)" : colors.foreground }}>
            {rate === 1 ? "1x" : rate === 1.5 ? "1.5x" : "2x"}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingLeft: isMe ? 52 : 4, paddingRight: 4 }}>
        <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: isMe ? "rgba(0,0,0,0.55)" : colors.mutedForeground }}>
          {playing ? formatVoiceClock(remaining) : formatVoiceClock(total)}
        </Text>
      </View>
    </View>
  );
}

/** In-bubble preview: tap opens full-screen viewer (WhatsApp-style). */
function ChatVideoThumbnailBubble({ uri, onOpen }: { uri: string; onOpen: () => void }) {
  const { playableUri, failed, loading } = usePlayableVideoUri(uri);
  const [durationSec, setDurationSec] = useState(0);

  if (failed) {
    return (
      <View style={styles.videoErrorWrap}>
        <Ionicons name="alert-circle-outline" size={20} color="#fff" />
        <Text style={styles.videoErrorText}>Video could not be loaded</Text>
      </View>
    );
  }

  if (loading || !playableUri) {
    return (
      <View style={styles.videoLoadingWrap}>
        <Ionicons name="hourglass-outline" size={20} color="#fff" />
        <Text style={styles.videoLoadingText}>Preparing video...</Text>
      </View>
    );
  }

  const dm = Math.floor(durationSec / 60);
  const ds = Math.floor(durationSec % 60);
  const durationLabel = `${dm}:${ds.toString().padStart(2, "0")}`;

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onOpen} style={styles.videoThumbWrap}>
      <Video
        source={{ uri: playableUri }}
        style={styles.msgVideo}
        useNativeControls={false}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isLooping={false}
        isMuted
        onLoad={(status) => {
          if (status.isLoaded && typeof status.durationMillis === "number") {
            setDurationSec(status.durationMillis / 1000);
          }
        }}
      />
      <View style={styles.videoThumbOverlay} pointerEvents="none">
        <Ionicons name="play-circle" size={56} color="rgba(255,255,255,0.92)" />
      </View>
      <View style={styles.videoThumbFooter} pointerEvents="none">
        <Ionicons name="videocam" size={13} color="#fff" />
        <Text style={styles.videoThumbDuration}>{durationLabel}</Text>
      </View>
    </TouchableOpacity>
  );
}

function LocationMessageBubble({
  item,
  colors,
  isMe,
  chatId,
  userAvatar,
  onStopLive,
}: {
  item: Message;
  colors: ReturnType<typeof useColors>;
  isMe: boolean;
  chatId: string | null;
  userAvatar?: string;
  onStopLive: (msg: Message) => void;
}) {
  const parsed = parseLocationPayload(item.text);
  const legacy = !parsed ? parseLegacyLocation(item.text) : null;
  const lat = parsed?.lat ?? legacy?.lat ?? 0;
  const lng = parsed?.lng ?? legacy?.lng ?? 0;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  const mapPreview = hasCoords ? staticMapImageUrl(lat, lng, Math.round(W * 0.62 * 2), 360, 15) : "";
  const isLiveActive = parsed?.mode === "live" && !parsed?.stopped;
  const untilMs = parsed?.until;
  const title = parsed?.mode === "live" ? "Live location" : "Location";
  const subtitle =
    parsed?.stopped
      ? "Sharing ended"
      : parsed?.label || (legacy ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : item.text.replace(/^📍[^\n]*\n?/, "").slice(0, 80));

  return (
    <View style={styles.locationBubbleWrap}>
      <Pressable onPress={() => item.mediaUrl && Linking.openURL(item.mediaUrl).catch(() => {})}>
        <Image source={{ uri: mapPreview }} style={styles.locationMapImg} contentFit="cover" />
      </Pressable>
      {isLiveActive ? (
        <View style={[styles.locationLiveBar, { borderTopColor: "rgba(0,0,0,0.08)" }]}>
          <Ionicons name="radio" size={16} color="#111" style={{ marginRight: 4 }} />
          <Ionicons name="location" size={18} color="#111" />
          <Ionicons name="radio" size={16} color="#111" style={{ marginLeft: 4 }} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.locationLiveSmall, { color: colors.mutedForeground }]}>Live until</Text>
            <Text style={[styles.locationLiveTime, { color: colors.foreground }]}>
              {untilMs ? formatLiveUntil(untilMs) : "—"}
            </Text>
          </View>
          {userAvatar ? (
            <Image source={{ uri: userAvatar }} style={styles.locationAvatarOnMap} contentFit="cover" />
          ) : null}
        </View>
      ) : (
        <View style={[styles.locationStaticFooter, { paddingHorizontal: 10, paddingVertical: 8 }]}>
          <Text style={[styles.locationStaticTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.locationCoords, { color: colors.mutedForeground }]} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
      )}
      {isLiveActive && isMe && chatId ? (
        <TouchableOpacity
          style={[styles.stopShareRow, { borderTopColor: "rgba(0,0,0,0.08)" }]}
          onPress={() => onStopLive(item)}
        >
          <Text style={styles.stopShareText}>Stop sharing</Text>
        </TouchableOpacity>
      ) : null}
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
    blockUser, unblockUser, reportUser,
    loadMessages, forwardMessage, updateLocationOnServer, stopLiveLocationSession,
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
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const prevSelectedCountRef = useRef(0);

  // Translation
  const [translatedMsgs, setTranslatedMsgs] = useState<Record<string, string>>({});

  // Forward modal
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);

  // Share contact — full-screen picker (Alert.alert only fits ~3 buttons on Android)
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactPickerLoading, setContactPickerLoading] = useState(false);
  const [contactPickerRows, setContactPickerRows] = useState<ContactShareRow[]>([]);
  const [contactPickerQuery, setContactPickerQuery] = useState("");

  // Edit mode
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");

  // Voice recording — WhatsApp-style panel (tap mic → record → pause / delete / send)
  const voiceRecRef = useRef<Audio.Recording | null>(null);
  const [voiceRecording, setVoiceRecording] = useState<Audio.Recording | null>(null);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voiceRecPaused, setVoiceRecPaused] = useState(false);
  const [voiceRecMs, setVoiceRecMs] = useState(0);
  const [voiceRecMeter, setVoiceRecMeter] = useState(0.25);
  const [enterIsSend, setEnterIsSend] = useState(false);

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
      void loadEnterIsSend().then(setEnterIsSend);
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

  const webEnterSend = Platform.OS === "web" && enterIsSend;

  const chat = chats.find((c) => c.id === chatId);
  const allMessages = chat?.messages ?? [];
  const selectionActive = selectedIds.length > 0;

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setBulkDeleteOpen(false);
  }, []);

  const messages = searching && searchQuery.trim()
    ? allMessages.filter((m) => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : allMessages;

  const listRows = useMemo(() => messagesWithDateRows(messages), [messages]);

  const peerNameForVideo = name ?? chat?.name ?? "Chat";

  const [groupSendPermission, setGroupSendPermission] = useState<{ canSend: boolean; policy: string } | null>(null);
  const [blockState, setBlockState] = useState<{ iBlockedThem: boolean; theyBlockedMe: boolean }>({ iBlockedThem: false, theyBlockedMe: false });

  useEffect(() => {
    setGroupSendPermission(null);
  }, [chatId]);

  useFocusEffect(
    useCallback(() => {
      if (!chatId || !chat?.isGroup || !user?.dbId) {
        setGroupSendPermission(null);
        return;
      }
      let cancelled = false;
      fetch(`${BASE_URL}/api/chats/${chatId}/messaging-permission?userId=${user.dbId}`)
        .then((r) => r.json())
        .then((d: { success?: boolean; canSendMessages?: boolean; policy?: string }) => {
          if (cancelled) return;
          if (d.success && typeof d.canSendMessages === "boolean" && typeof d.policy === "string") {
            setGroupSendPermission({ canSend: d.canSendMessages, policy: d.policy });
          } else {
            setGroupSendPermission({ canSend: false, policy: "everyone" });
          }
        })
        .catch(() => {
          if (!cancelled) setGroupSendPermission({ canSend: false, policy: "everyone" });
        });
      return () => {
        cancelled = true;
      };
    }, [chatId, chat?.isGroup, user?.dbId]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!chatId || chat?.isGroup || !user?.dbId) {
        setBlockState({ iBlockedThem: false, theyBlockedMe: false });
        return;
      }
      const otherId = chat?.otherUserId;
      if (!otherId) return;
      let cancelled = false;
      fetch(`${BASE_URL}/api/users/${user.dbId}/block-status?otherUserId=${otherId}`)
        .then((r) => r.json())
        .then((s: { success?: boolean; i_blocked_them?: boolean; they_blocked_me?: boolean }) => {
          if (!cancelled && s.success) {
            setBlockState({ iBlockedThem: Boolean(s.i_blocked_them), theyBlockedMe: Boolean(s.they_blocked_me) });
          }
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [chatId, chat?.isGroup, chat?.otherUserId, user?.dbId])
  );

  const composerEnabled =
    !initializing
    && !blockState.iBlockedThem
    && !blockState.theyBlockedMe
    && (editTarget != null || !chat?.isGroup || groupSendPermission?.canSend === true);

  const openChatVideoFullScreen = useCallback(
    async (mediaUri: string, senderIsMe: boolean, ts: number) => {
      try {
        let playUri = mediaUri;
        if (mediaUri.startsWith("data:video")) {
          const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
          if (!cacheDir) throw new Error("No cache");
          const ext = mediaUri.includes("video/quicktime") ? "mov" : "mp4";
          playUri = `${cacheDir}viewer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
          const base64 = mediaUri.replace(/^data:[^;]+;base64,/, "");
          await FileSystem.writeAsStringAsync(playUri, base64, { encoding: FileSystem.EncodingType.Base64 });
        }
        router.push({
          pathname: "/chat/video-viewer",
          params: {
            playUri: encodeURIComponent(playUri),
            senderLabel: senderIsMe ? "You" : peerNameForVideo,
            timestamp: String(ts),
          },
        } as unknown as Parameters<typeof router.push>[0]);
      } catch {
        Alert.alert("Error", "Could not open the video.");
      }
    },
    [router, peerNameForVideo],
  );

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyData>(null);
  useEffect(() => {
    if (selectedIds.length > 0 && prevSelectedCountRef.current === 0) {
      setReplyTo(null);
      setEditTarget(null);
      setEditText("");
    }
    prevSelectedCountRef.current = selectedIds.length;
  }, [selectedIds.length]);
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
    if (!composerEnabled) {
      Alert.alert(
        "Cannot send message",
        chat?.isGroup && groupSendPermission?.policy === "admins_only"
          ? "Only admins can send messages in this group."
          : "You do not have permission to send messages here.",
      );
      return;
    }
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
  }, [text, chatId, sendMessage, replyTo, clearTyping, editTarget, editText, editMessage, composerEnabled, chat?.isGroup, groupSendPermission?.policy]);

  const voiceRecOptions = useMemo(
    () => ({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true as const }),
    [],
  );

  const closeVoicePanel = useCallback(async () => {
    const rec = voiceRecRef.current;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch { /* ignore */ }
      voiceRecRef.current = null;
      setVoiceRecording(null);
    }
    setVoicePanelOpen(false);
    setVoiceRecPaused(false);
    setVoiceRecMs(0);
    setVoiceRecMeter(0.25);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
    } catch { /* ignore */ }
  }, []);

  const openVoiceRecorder = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not supported on web", "Use the mobile app to send voice messages.");
      return;
    }
    if (!composerEnabled || editTarget) {
      Alert.alert(
        "Cannot send message",
        chat?.isGroup && groupSendPermission?.policy === "admins_only"
          ? "Only admins can send messages in this group."
          : "You do not have permission to send voice messages here.",
      );
      return;
    }
    if (voicePanelOpen) return;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Microphone permission is required for voice notes.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(
        voiceRecOptions,
        (st) => {
          if (st.isRecording && typeof st.durationMillis === "number") {
            setVoiceRecMs(st.durationMillis);
          }
          if (st.isRecording && typeof st.metering === "number") {
            const n = Math.max(0, Math.min(1, (st.metering + 55) / 60));
            setVoiceRecMeter(n);
          }
        },
        100,
      );
      voiceRecRef.current = rec;
      setVoiceRecording(rec);
      setVoiceRecPaused(false);
      setVoiceRecMs(0);
      setVoicePanelOpen(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Error", "Could not start recording. Please try again.");
    }
  }, [composerEnabled, editTarget, voicePanelOpen, voiceRecOptions, chat?.isGroup, groupSendPermission?.policy]);

  const cancelVoiceRecording = useCallback(() => {
    void closeVoicePanel();
  }, [closeVoicePanel]);

  const toggleVoicePause = useCallback(async () => {
    if (!voiceRecording) return;
    try {
      if (voiceRecPaused) {
        await voiceRecording.startAsync();
        setVoiceRecPaused(false);
      } else {
        await voiceRecording.pauseAsync();
        setVoiceRecPaused(true);
      }
    } catch { /* ignore */ }
  }, [voiceRecording, voiceRecPaused]);

  const sendVoiceRecording = useCallback(async () => {
    const rec = voiceRecRef.current;
    if (!rec || !chatId) return;
    try {
      const st = await rec.getStatusAsync();
      const durMs =
        typeof st.durationMillis === "number" && st.durationMillis > 200
          ? st.durationMillis
          : voiceRecMs;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      voiceRecRef.current = null;
      setVoiceRecording(null);
      setVoicePanelOpen(false);
      setVoiceRecPaused(false);
      setVoiceRecMs(0);
      const durSec = Math.max(0.4, durMs / 1000);
      if (uri) {
        sendAudioMessage(chatId, uri, durSec);
      }
    } catch {
      Alert.alert("Error", "Could not send this voice message.");
    } finally {
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      } catch { /* ignore */ }
    }
  }, [chatId, voiceRecMs, sendAudioMessage]);

  const sendMediaMessage = async (
    type: "camera" | "gallery" | "document" | "location" | "contact" | "viewonce" | "audiofile",
  ) => {
    if (!chatId) return;
    if (!composerEnabled || editTarget) {
      Alert.alert(
        "Cannot send message",
        chat?.isGroup && groupSendPermission?.policy === "admins_only"
          ? "Only admins can send messages in this group."
          : "You do not have permission to send messages here.",
      );
      return;
    }
    const isViewOnce = type === "viewonce";

    if (type === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission required", "Camera access is required."); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.75, base64: false });
      if (!result.canceled && result.assets[0]) sendImageMessage(chatId, result.assets[0].uri, undefined, false, "image");

    } else if (type === "gallery" || type === "viewonce") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission required", "Media library access is required."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.75, base64: false });
      if (!result.canceled && result.assets[0]) {
        const kind = result.assets[0].type === "video" ? "video" : "image";
        sendImageMessage(chatId, result.assets[0].uri, undefined, isViewOnce, kind);
      }

    } else if (type === "audiofile") {
      if (Platform.OS === "web") {
        Alert.alert("Not supported on web", "Use the mobile app to send audio files.");
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*", "audio/mpeg", "audio/mp4", "audio/mp3", "audio/wav", "audio/x-wav", "audio/aac"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      sendAudioMessage(chatId, result.assets[0].uri, 1);

    } else if (type === "document") {
      if (Platform.OS === "web") { Alert.alert("Not supported on web", "Use the mobile app to share documents."); return; }
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const fileSizeMB = (asset.size ?? 0) / 1024 / 1024;
      if (fileSizeMB > 16) { Alert.alert("File too large", "Maximum allowed file size is 16MB."); return; }
      try {
        const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
        if (!cacheDir) throw new Error("No writable cache directory");
        const mimeType = asset.mimeType ?? "application/octet-stream";
        const ext = asset.name?.split(".").pop() ?? "bin";

        // Some Android providers return content:// URIs that fail on direct read.
        // Use layered fallbacks so PDF/Excel/Docs can still be sent reliably.
        let base64 = "";
        const attemptReadBase64 = async (uri: string) => {
          return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        };
        try {
          base64 = await attemptReadBase64(asset.uri);
        } catch {
          try {
            const fallbackPath = `${cacheDir}doc_${Date.now()}.${ext}`;
            await FileSystem.copyAsync({ from: asset.uri, to: fallbackPath });
            base64 = await attemptReadBase64(fallbackPath);
          } catch {
            const resp = await fetch(asset.uri);
            const blob = await resp.blob();
            base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = typeof reader.result === "string" ? reader.result : "";
                const payload = dataUrl.replace(/^data:[^;]+;base64,/, "");
                if (!payload) reject(new Error("Empty file payload"));
                else resolve(payload);
              };
              reader.onerror = () => reject(new Error("Failed to convert document to base64"));
              reader.readAsDataURL(blob);
            });
          }
        }

        const dataUri = `data:${mimeType};base64,${base64}`;
        sendSpecialMessage(chatId, asset.name, "document", dataUri);
      } catch { Alert.alert("Error", "Could not read the selected file. Please try again."); }

    } else if (type === "location") {
      if (!chatId) return;
      router.push({ pathname: "/chat/send-location" as never, params: { id: chatId } });

    } else if (type === "contact") {
      if (Platform.OS === "web") { Alert.alert("Not supported on web", "Use the mobile app to share contacts."); return; }
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission required", "Contacts access is required to share contacts."); return; }
      setContactPickerQuery("");
      setContactPickerRows([]);
      setContactPickerOpen(true);
      setContactPickerLoading(true);
      try {
        const data = await loadAllDeviceContactsForShare();
        if (!data || data.length === 0) {
          setContactPickerOpen(false);
          Alert.alert("No contacts", "No contacts were found on this device.");
          return;
        }
        setContactPickerRows(buildContactShareRows(data));
      } catch {
        setContactPickerOpen(false);
        Alert.alert("Error", "Could not load contacts. Please try again.");
      } finally {
        setContactPickerLoading(false);
      }
    }
  };

  const sendSpecialMessage = useCallback((cid: string, text: string, msgType: string, mediaUrl?: string) => {
    const u = user;
    if (u?.dbId) {
      void (async () => {
        try {
          const res = await fetch(`${BASE_URL}/api/chats/${cid}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ senderId: u.dbId, content: text, type: msgType, mediaUrl: mediaUrl ?? null }),
          });
          const data = (await res.json()) as { success?: boolean; message?: string };
          if (res.status === 403) {
            Alert.alert("Cannot send message", typeof data.message === "string" ? data.message : "You are not allowed to send messages here.");
            return;
          }
          if (data.success !== false) await loadMessages(cid);
        } catch {
          Alert.alert("Error", "Failed to send the attachment. Please try again.");
        }
      })();
    }
  }, [user, loadMessages]);

  const contactPickerSections = useMemo(() => {
    const qRaw = contactPickerQuery.trim().toLowerCase();
    const qDigits = qRaw.replace(/\D/g, "");
    const filtered = contactPickerRows.filter((r) => {
      if (!qRaw) return true;
      if (r.name.toLowerCase().includes(qRaw)) return true;
      if (qDigits.length > 0 && r.phone.replace(/\D/g, "").includes(qDigits)) return true;
      return false;
    });
    const groups = new Map<string, ContactShareRow[]>();
    for (const r of filtered) {
      const ch = (r.name.charAt(0) || "#").toUpperCase();
      const section = /[A-Z]/.test(ch) ? ch : "#";
      const arr = groups.get(section);
      if (arr) arr.push(r);
      else groups.set(section, [r]);
    }
    const keys = [...groups.keys()].sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
    return keys.map((title) => ({ title, data: groups.get(title)! }));
  }, [contactPickerRows, contactPickerQuery]);

  const confirmShareContact = useCallback(
    (row: ContactShareRow) => {
      if (!chatId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const body = row.phone ? `👤 ${row.name}\n${row.phone}` : `👤 ${row.name}`;
      sendSpecialMessage(chatId, body, "contact");
      setContactPickerOpen(false);
      setContactPickerQuery("");
      setContactPickerRows([]);
    },
    [chatId, sendSpecialMessage],
  );

  const handleStopLiveLocation = useCallback(async (msg: Message) => {
    if (!chatId) return;
    const p = parseLocationPayload(msg.text);
    if (!p || p.mode !== "live") return;
    const next = encodeLocationPayload({ ...p, stopped: true });
    await updateLocationOnServer(chatId, msg.id, { content: next, mediaUrl: mapsUrl(p.lat, p.lng) });
    stopLiveLocationSession();
  }, [chatId, updateLocationOnServer, stopLiveLocationSession]);

  const openDocumentAttachment = useCallback(async (item: Message) => {
    const uri = item.mediaUrl;
    if (!uri) return;
    try {
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
      if (!cacheDir) throw new Error("No writable cache directory");
      let fileUri = uri;
      let mime = "application/octet-stream";
      if (uri.startsWith("data:")) {
        const mimeMatch = uri.match(/^data:([^;]+);base64,/);
        const base64 = uri.replace(/^data:[^;]+;base64,/, "");
        mime = mimeMatch?.[1] ?? "application/octet-stream";
        const ext = MIME_EXTENSION_MAP[mime] ?? "bin";
        fileUri = `${cacheDir}${safeFileName(item.text, `document_${Date.now()}`, ext)}`;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      } else if (/^https?:\/\//i.test(uri)) {
        const guessedExt = item.text?.split(".").pop()?.slice(0, 8) || "bin";
        const downloadTarget = `${cacheDir}${safeFileName(item.text, `document_${Date.now()}`, guessedExt)}`;
        const downloaded = await FileSystem.downloadAsync(uri, downloadTarget);
        fileUri = downloaded.uri;
      }
      if (Platform.OS !== "web" && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: mime,
          dialogTitle: item.text || "Open document",
        });
        return;
      }
      await Linking.openURL(fileUri);
    } catch {
      Alert.alert("Error", "Could not open this document on your device.");
    }
  }, []);

  const saveImageToGallery = useCallback(async (uri: string) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Photo library permission is required to save images.");
        return;
      }
      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
      if (!cacheDir) throw new Error("No writable cache directory");
      let fileUri = uri;
      if (uri.startsWith("data:")) {
        const mimeMatch = uri.match(/^data:([^;]+);base64,/);
        const mime = mimeMatch?.[1] ?? "image/jpeg";
        const ext = MIME_EXTENSION_MAP[mime] ?? "jpg";
        const base64 = uri.replace(/^data:[^;]+;base64,/, "");
        fileUri = `${cacheDir}videh_image_${Date.now()}.${ext}`;
        await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      } else if (/^https?:\/\//i.test(uri)) {
        const downloaded = await FileSystem.downloadAsync(uri, `${cacheDir}videh_image_${Date.now()}.jpg`);
        fileUri = downloaded.uri;
      }
      await MediaLibrary.saveToLibraryAsync(fileUri);
      Alert.alert("Saved", "Image saved to your gallery.");
    } catch {
      Alert.alert("Error", "Could not save this image. Please try again.");
    }
  }, []);

  const [attachVisible, setAttachVisible] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ uri: string; caption?: string; type: "image" | "video" } | null>(null);
  const showAttachMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAttachVisible(true);
  };

  const showMessageContextMenu = (msg: Message) => {
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
    }
    opts.push({
      text: "🗑 Delete",
      style: "destructive" as const,
      onPress: () => setDeleteTarget(msg),
    });
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
        Alert.alert("Translation failed", "Could not translate this message. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Network error");
    }
  }, []);

  const renderMsg = ({ item }: { item: Message }) => {
    const isMe = item.senderId === "me";
    const isDeleted = item.type === "deleted";
    const isImage = item.type === "image" && !!item.mediaUrl;
    const isVideo = item.type === "video" && !!item.mediaUrl;
    const isAudio = item.type === "audio" && !!item.mediaUrl;
    const isDocument = item.type === "document";
    const isLocation = item.type === "location";
    const isContact = item.type === "contact";
    const isSpecial = isDocument || isLocation || isContact;
    const urls = (!isDeleted && !isImage && !isAudio && !isSpecial) ? extractUrls(item.text) : [];
    const isManyForwarded = (item.forwardCount ?? 0) >= 5;
    const metaTextColor = isImage || isLocation
      ? "rgba(255,255,255,0.92)"
      : isMe
        ? "rgba(0,0,0,0.55)"
        : colors.mutedForeground;

    const showSvgTail = !isImage && !isVideo && !isLocation;

    // Group reactions by emoji
    const reactionGroups: Record<string, { count: number; mine: boolean }> = {};
    (item.reactions ?? []).forEach((r) => {
      if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = { count: 0, mine: false };
      reactionGroups[r.emoji].count++;
      if (r.userId === user?.dbId) reactionGroups[r.emoji].mine = true;
    });
    const hasReactions = Object.keys(reactionGroups).length > 0;

    const replySwipeBg = colors.isDark ? "rgba(30,42,48,0.96)" : "rgba(232,234,237,0.98)";
    const renderLeftReply = () => (
      <View style={[styles.swipeReplyRail, { width: REPLY_SWIPE_ACTION_W, backgroundColor: replySwipeBg }]}>
        <Ionicons name="return-down-back" size={22} color={colors.primary} />
      </View>
    );
    const renderRightReply = () => (
      <View style={[styles.swipeReplyRail, { width: REPLY_SWIPE_ACTION_W, backgroundColor: replySwipeBg }]}>
        <Ionicons name="return-down-forward" size={22} color={colors.primary} />
      </View>
    );

    const isSelected = selectedIds.includes(item.id);
    const selectionRowTint = colors.isDark ? "rgba(0, 168, 132, 0.2)" : "rgba(183, 223, 165, 0.55)";
    const deletedMeLabel = colors.isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.52)";
    const deletedMeIcon = colors.isDark ? "rgba(255,255,255,0.58)" : "rgba(0,0,0,0.42)";
    const deletedMeTime = colors.isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.42)";
    const msgRow = (
      <View style={[styles.msgRowOuter, isSelected && styles.msgRowOuterBleed]}>
        {isSelected ? (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: selectionRowTint }]} pointerEvents="none" />
        ) : null}
        <Pressable
          onPress={() => {
            if (selectedIds.length > 0 && !isDeleted) {
              setSelectedIds((prev) =>
                prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id],
              );
              return;
            }
            if (!isDeleted) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setReactionTarget(item);
            }
          }}
          onLongPress={() => {
            if (isDeleted) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSelectedIds((prev) => {
              if (prev.length === 0) return [item.id];
              return prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id];
            });
          }}
          delayLongPress={450}
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

        <View style={styles.bubbleTailWrap}>
          <View
            style={[
              styles.bubble,
              showSvgTail && styles.bubbleWithTailShape,
              { backgroundColor: isMe ? colors.chatBubbleSent : colors.chatBubbleReceived },
              (isImage || isVideo || isLocation) && styles.bubbleImg,
              isDeleted && styles.bubbleDeleted,
            ]}
          >
          {/* Reply strip */}
          {item.replyToId && item.replyText && !isDeleted && (
            <View style={[styles.replyStrip, { borderLeftColor: colors.primary, backgroundColor: isMe ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.07)" }]}>
              <Text style={[styles.replyWho, { color: colors.primary }]}>
                {item.replySenderName ?? (item.replyToId === "me" ? "You" : "Them")}
              </Text>
              <Text style={[styles.replyText, { color: colors.mutedForeground }]} numberOfLines={1}>{item.replyText}</Text>
            </View>
          )}

          {/* Content */}
          {isDeleted ? (
            <View style={styles.deletedRowWa}>
              <Ionicons
                name="remove-circle-outline"
                size={15}
                color={isMe ? deletedMeIcon : colors.mutedForeground}
                style={styles.deletedIconWa}
              />
              <Text
                style={[
                  styles.deletedTextWa,
                  { color: isMe ? deletedMeLabel : colors.mutedForeground },
                ]}
                numberOfLines={3}
              >
                {isMe ? "You deleted this message" : "This message was deleted"}
              </Text>
              <Text style={[styles.deletedTimeWa, { color: isMe ? deletedMeTime : colors.mutedForeground }]}>
                {formatChatBubbleTime(item.timestamp)}
              </Text>
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
          ) : isVideo ? (
            <>
              <ChatVideoThumbnailBubble
                uri={item.mediaUrl!}
                onOpen={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  void openChatVideoFullScreen(item.mediaUrl!, isMe, item.timestamp);
                }}
              />
              {item.text && item.text !== "🎥 Video" && item.text !== "🔁 View once" && (
                <Text style={[styles.msgText, { color: colors.foreground, paddingHorizontal: 8, paddingTop: 4 }]}>{item.text}</Text>
              )}
            </>
          ) : isAudio ? (
            <VoiceNotePlayer
              uri={item.mediaUrl!}
              colors={colors}
              isMe={isMe}
              messageId={item.id}
              durationHintSec={parseVoiceDurationSec(item.text)}
              avatarUri={isMe ? (user?.avatar ?? undefined) : undefined}
            />
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
            <LocationMessageBubble
              item={item}
              colors={colors}
              isMe={isMe}
              chatId={chatId}
              userAvatar={isMe ? user?.avatar : (chat?.avatar ?? otherAvatar)}
              onStopLive={(m) => { void handleStopLiveLocation(m); }}
            />
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

          {/* Meta: time + edited + ticks (hidden for deleted — time sits on deleted row like WhatsApp) */}
          {!isDeleted ? (
            <View style={[styles.msgMeta, (isImage || isVideo || isLocation) && styles.msgMetaOnMedia]}>
              {item.isEdited && <Text style={[styles.editedLabel, { color: colors.mutedForeground }]}>edited </Text>}
              <Text style={[styles.msgTime, { color: metaTextColor }]}>
                {formatChatBubbleTime(item.timestamp)}
              </Text>
              {isMe && (
                <TickIcon status={item.status} color={metaTextColor} />
              )}
            </View>
          ) : null}
          </View>
          {showSvgTail ? (
            <ChatBubbleTail
              fill={isMe ? colors.chatBubbleSent : colors.chatBubbleReceived}
              side={isMe ? "right" : "left"}
            />
          ) : null}
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
      </Pressable>
      </View>
    );

    if (Platform.OS === "web" || isDeleted || selectedIds.length > 0) return msgRow;

    return (
      <Swipeable
        containerStyle={[styles.msgSwipeRow, styles.msgSwipeContainer]}
        renderLeftActions={!isMe ? renderLeftReply : undefined}
        renderRightActions={isMe ? renderRightReply : undefined}
        overshootLeft={false}
        overshootRight={false}
        friction={2}
        leftThreshold={40}
        rightThreshold={40}
        onSwipeableOpen={(direction, swipeable) => {
          const ok = (!isMe && direction === "left") || (isMe && direction === "right");
          if (!ok) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setReplyTo({
            id: item.id,
            text: item.text,
            senderId: item.senderId,
            senderName: item.senderName,
          });
          inputRef.current?.focus();
          swipeable.close();
        }}
      >
        {msgRow}
      </Swipeable>
    );
  };

  const renderChatListRow = ({ item: row }: { item: ChatListRow }) => {
    if (row.rowType === "date") {
      return (
        <View style={styles.dateChipWrap} pointerEvents="none">
          <View
            style={[
              styles.dateChipPill,
              { backgroundColor: colors.isDark ? "rgba(38,52,59,0.92)" : "rgba(235,237,239,0.96)" },
            ]}
          >
            <Text style={[styles.dateChipText, { color: colors.mutedForeground }]}>{row.label}</Text>
          </View>
        </View>
      );
    }
    return renderMsg({ item: row.message });
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

  const directContactId = !chat?.isGroup ? chat?.otherUserId : undefined;

  const handleMenuBlockToggle = useCallback(() => {
    if (!directContactId) {
      Alert.alert("Error", "Cannot identify this contact.");
      return;
    }
    const action = blockState.iBlockedThem ? "Unblock" : "Block";
    Alert.alert(
      `${action} ${displayName}?`,
      blockState.iBlockedThem
        ? "They will be able to message and call you again."
        : "Blocked contacts cannot message, call, or see your status updates.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action,
          style: blockState.iBlockedThem ? "default" : "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            if (blockState.iBlockedThem) {
              await unblockUser(directContactId);
              setBlockState((prev) => ({ ...prev, iBlockedThem: false }));
            } else {
              await blockUser(directContactId);
              setBlockState((prev) => ({ ...prev, iBlockedThem: true }));
            }
          },
        },
      ],
    );
  }, [blockState.iBlockedThem, blockUser, directContactId, displayName, unblockUser]);

  const handleMenuReport = useCallback((blockAfterReport: boolean) => {
    if (!directContactId || !chatId) {
      Alert.alert("Report", "Your report has been submitted.");
      return;
    }
    Alert.alert(
      blockAfterReport ? `Report and block ${displayName}?` : `Report ${displayName}?`,
      blockAfterReport
        ? "This contact will be reported and blocked. They will not be notified."
        : "This contact will be reported. They will not be notified.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: blockAfterReport ? "Report and block" : "Report",
          style: blockAfterReport ? "destructive" : "default",
          onPress: async () => {
            await reportUser(directContactId, {
              chatId,
              reason: blockAfterReport ? "reported_and_blocked_from_chat_menu" : "reported_from_chat_menu",
              block: blockAfterReport,
            });
            if (blockAfterReport) setBlockState((prev) => ({ ...prev, iBlockedThem: true }));
            Alert.alert(blockAfterReport ? "Reported and blocked" : "Report sent", blockAfterReport ? "This contact can no longer call or message you." : "Thank you. We will review this contact.");
          },
        },
      ],
    );
  }, [chatId, directContactId, displayName, reportUser]);

  const chatMenuItems = [
    { label: "Chat info", icon: "information-circle-outline", onPress: () => chatId && router.push({ pathname: "/chat-info/[id]", params: { id: chatId, name: displayName } }) },
    { label: "Starred messages", icon: "star-outline", onPress: () => router.push("/starred") },
    { label: "Wallpaper", icon: "image-outline", onPress: () => Alert.alert("Chat wallpaper", "", [
        { text: "Choose photo", onPress: pickWallpaper },
        ...(wallpaper ? [{ text: "Remove wallpaper", style: "destructive" as const, onPress: removeWallpaper }] : []),
        { text: "Cancel", style: "cancel" as const },
      ]) },
    { label: "Schedule Message ⏰", icon: "time-outline", onPress: () => chatId && router.push({ pathname: "/scheduled/[chatId]", params: { chatId, name: displayName } }) },
    { label: "Ledger 💰", icon: "cash-outline", onPress: () => chatId && router.push({ pathname: "/khata/[chatId]", params: { chatId, name: displayName } }) },
    { label: "Mute notifications", icon: "notifications-off-outline", onPress: () => chatId && muteChat(chatId) },
    { label: "Search", icon: "search-outline", onPress: () => { clearSelection(); setSearching(true); setSearchQuery(""); } },
    ...(!chat?.isGroup && directContactId ? [
      { label: blockState.iBlockedThem ? `Unblock ${displayName}` : `Block ${displayName}`, icon: blockState.iBlockedThem ? "checkmark-circle-outline" : "ban-outline", danger: !blockState.iBlockedThem, onPress: handleMenuBlockToggle },
      { label: `Report ${displayName}`, icon: "flag-outline", danger: true, onPress: () => handleMenuReport(false) },
      { label: "Report and block", icon: "shield-outline", danger: true, onPress: () => handleMenuReport(true) },
    ] : [
      { label: "Report group", icon: "flag-outline", danger: true, onPress: () => Alert.alert("Report group", "Your report has been submitted.") },
    ]),
  ];

  const bulkSelectedMessages = selectedIds
    .map((id) => allMessages.find((m) => m.id === id))
    .filter((m): m is Message => !!m);
  const bulkAllMineDeletable =
    bulkSelectedMessages.length > 0 &&
    bulkSelectedMessages.every((m) => m.senderId === "me" && m.type !== "deleted");
  const bulkHasMine = bulkSelectedMessages.some((m) => m.senderId === "me" && m.type !== "deleted");
  const bulkOthersCount = bulkSelectedMessages.filter((m) => m.senderId !== "me" && m.type !== "deleted").length;

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
      {selectionActive ? (
        <View style={[styles.header, styles.selectionHeader, { paddingTop: topPad }]}>
          <TouchableOpacity style={styles.backBtn} onPress={clearSelection}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0, justifyContent: "center", paddingHorizontal: 6 }}>
            <Text style={styles.headerName} numberOfLines={1}>
              {selectedIds.length} selected
            </Text>
          </View>
          <View style={[styles.headerActions, styles.selectionHeaderActions]}>
            {selectedIds.length === 1 ? (
              <>
                <TouchableOpacity
                  style={styles.headerBtn}
                  onPress={() => {
                    const m = allMessages.find((x) => x.id === selectedIds[0]);
                    if (!m || m.type === "deleted") return;
                    setReplyTo({
                      id: m.id,
                      text: m.text,
                      senderId: m.senderId,
                      senderName: m.senderName,
                    });
                    clearSelection();
                    inputRef.current?.focus();
                  }}
                >
                  <Ionicons name="arrow-undo-outline" size={21} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerBtn}
                  onPress={() => {
                    const m = allMessages.find((x) => x.id === selectedIds[0]);
                    if (!m || !chatId || m.type === "deleted") return;
                    starMessage(chatId, m.id);
                  }}
                >
                  <Ionicons name="star-outline" size={21} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerBtn}
                  onPress={() => {
                    const m = allMessages.find((x) => x.id === selectedIds[0]);
                    if (!m || m.type === "deleted") return;
                    Clipboard.setString(m.text);
                  }}
                >
                  <Ionicons name="copy-outline" size={21} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerBtn}
                  onPress={() => {
                    const m = allMessages.find((x) => x.id === selectedIds[0]);
                    if (!m || m.type === "deleted") return;
                    setForwardMsg(m);
                    clearSelection();
                  }}
                >
                  <Ionicons name="arrow-redo-outline" size={21} color="#fff" />
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity style={styles.headerBtn} onPress={() => setBulkDeleteOpen(true)}>
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </TouchableOpacity>
            {selectedIds.length === 1 ? (
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => {
                  const m = allMessages.find((x) => x.id === selectedIds[0]);
                  if (!m) return;
                  clearSelection();
                  showMessageContextMenu(m);
                }}
              >
                <Ionicons name="ellipsis-vertical" size={22} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : (
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
                <TouchableOpacity
                  style={[styles.headerBtn, (!chat?.isGroup && (blockState.iBlockedThem || blockState.theyBlockedMe)) && { opacity: 0.45 }]}
                  disabled={!chat?.isGroup && (blockState.iBlockedThem || blockState.theyBlockedMe)}
                  onPress={() => chatId && router.push({ pathname: "/call/[id]", params: { id: chatId, type: "video", name: displayName } })}
                >
                  <Ionicons name="videocam-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.headerBtn, (!chat?.isGroup && (blockState.iBlockedThem || blockState.theyBlockedMe)) && { opacity: 0.45 }]}
                  disabled={!chat?.isGroup && (blockState.iBlockedThem || blockState.theyBlockedMe)}
                  onPress={() => chatId && router.push({ pathname: "/call/[id]", params: { id: chatId, type: "audio", name: displayName } })}
                >
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
      )}
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
          data={listRows}
          extraData={selectedIds.join(",")}
          keyExtractor={(row) => (row.rowType === "date" ? row.id : row.message.id)}
          renderItem={renderChatListRow}
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 10 }}
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
        {!selectionActive && mentionResults.length > 0 && mentionQuery !== null && (
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
        {!selectionActive && editTarget && (
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
        {!selectionActive && replyTo && !editTarget && (
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

        {/* Voice record panel — timer, live bars, delete / pause / send */}
        {!selectionActive && voicePanelOpen && (
          <View style={[styles.voiceRecordPanel, { backgroundColor: colors.isDark ? "#1a2329" : "#DCF8C6", borderTopColor: colors.border }]}>
            <Text style={[styles.voiceRecTimer, { color: colors.foreground }]}>
              {formatVoiceClock(voiceRecMs / 1000)}
            </Text>
            <View style={styles.voiceRecWaveRow}>
              {Array.from({ length: 36 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.voiceRecBar,
                    {
                      height: 5 + voiceRecMeter * 16 + ((i * 17) % 9),
                      backgroundColor: colors.isDark ? "rgba(0,168,132,0.55)" : "rgba(0,168,132,0.45)",
                    },
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity onPress={cancelVoiceRecording} style={styles.voiceRecIconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Delete recording">
              <Ionicons name="trash-outline" size={24} color="#c62828" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { void toggleVoicePause(); }} style={styles.voiceRecIconBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={voiceRecPaused ? "Resume recording" : "Pause recording"}>
              <Ionicons name={voiceRecPaused ? "play" : "pause"} size={26} color={voiceRecPaused ? colors.primary : "#c62828"} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { void sendVoiceRecording(); }}
              style={[styles.voiceRecSendFab, { backgroundColor: colors.primary }]}
              accessibilityLabel="Send voice message"
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {!chat?.isGroup && (blockState.iBlockedThem || blockState.theyBlockedMe) && !editTarget && (
          <View style={[styles.groupLockBanner, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Ionicons name="ban-outline" size={18} color={colors.mutedForeground} />
            <Text style={[styles.groupLockBannerText, { color: colors.foreground }]}>
              {blockState.iBlockedThem
                ? "You blocked this contact. Unblock to send messages or call."
                : "You cannot message or call this contact."}
            </Text>
          </View>
        )}

        {chat?.isGroup && groupSendPermission && !groupSendPermission.canSend && !editTarget && (
          <View style={[styles.groupLockBanner, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
            <Text style={[styles.groupLockBannerText, { color: colors.foreground }]}>
              {groupSendPermission.policy === "admins_only"
                ? "Only admins can send messages here. Admins can change this in Group info."
                : "You cannot send messages until a group admin allows you. Admins can change this in Group info."}
            </Text>
          </View>
        )}

        {/* Input bar */}
        {!selectionActive && (
          <View
            style={[
              styles.inputBar,
              {
                backgroundColor: colors.isDark ? colors.background : "#F0F2F5",
                borderTopColor: colors.isDark ? colors.border : "rgba(0,0,0,0.06)",
                paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8),
              },
            ]}
          >
            <TouchableOpacity style={styles.inputIcon}>
              <Ionicons name="happy-outline" size={24} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              style={[
                styles.inputField,
                {
                  backgroundColor: colors.isDark ? colors.card : "#FFFFFF",
                  color: colors.foreground,
                  borderColor: colors.isDark ? colors.border : "rgba(0,0,0,0.06)",
                },
              ]}
              placeholder={editTarget ? "Edit message..." : "Message"}
              placeholderTextColor={colors.mutedForeground}
              value={inputVal}
              onChangeText={handleTextChange}
              multiline={!webEnterSend}
              blurOnSubmit={webEnterSend}
              onSubmitEditing={webEnterSend ? () => handleSend() : undefined}
              maxLength={2000}
              editable={composerEnabled}
            />
            {!inputVal.trim() && (
              <TouchableOpacity
                style={styles.inputIcon}
                onPress={showAttachMenu}
                disabled={!composerEnabled || !!editTarget}
              >
                <Ionicons name="attach-outline" size={24} color={composerEnabled && !editTarget ? colors.mutedForeground : colors.mutedForeground + "55"} />
              </TouchableOpacity>
            )}
            {!inputVal.trim() && (
              <TouchableOpacity
                style={styles.inputIcon}
                onPress={() => sendMediaMessage("camera")}
                disabled={!composerEnabled || !!editTarget}
              >
                <Ionicons name="camera-outline" size={24} color={composerEnabled && !editTarget ? colors.mutedForeground : colors.mutedForeground + "55"} />
              </TouchableOpacity>
            )}
            {inputVal.trim() ? (
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.primary }, (!composerEnabled || initializing) && { opacity: 0.5 }]}
                disabled={!composerEnabled || initializing}
                onPress={handleSend}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.primary }, (!composerEnabled || !!editTarget || voicePanelOpen) && { opacity: 0.45 }]}
                onPress={() => { void openVoiceRecorder(); }}
                disabled={!composerEnabled || !!editTarget || voicePanelOpen}
              >
                <Ionicons name="mic-outline" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Attach menu — WhatsApp-style bottom sheet (coloured circles + grid) */}
      <Modal visible={attachVisible} transparent animationType="fade" onRequestClose={() => setAttachVisible(false)}>
        <View style={styles.attachModalRoot}>
          <Pressable style={styles.attachBackdrop} onPress={() => setAttachVisible(false)} />
          <View
            style={[
              styles.attachSheet,
              { backgroundColor: colors.isDark ? "#1A2329" : "#F0F2F5", paddingBottom: insets.bottom + 12 },
            ]}
          >
            <View style={[styles.attachHandle, { backgroundColor: colors.isDark ? "#3d4a54" : "#c4ccd4" }]} />
            <View style={styles.attachWaGrid}>
              {ATTACH_SHEET_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={styles.attachWaCell}
                  activeOpacity={0.75}
                  onPress={() => {
                    setAttachVisible(false);
                    void sendMediaMessage(item.type);
                  }}
                >
                  <View style={[styles.attachWaCircle, { backgroundColor: item.color }]}>
                    <Ionicons name={item.icon} size={26} color="#fff" />
                  </View>
                  <Text style={[styles.attachWaLabel, { color: colors.isDark ? "#E9EDEF" : "#3B4A54" }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.attachViewOnceRow}
              onPress={() => {
                setAttachVisible(false);
                void sendMediaMessage("viewonce");
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.attachWaCircleSm, { backgroundColor: "#6B7C8A" }]}>
                <Ionicons name="eye" size={18} color="#fff" />
              </View>
              <Text style={[styles.attachViewOnceText, { color: colors.primary }]}>View once photo or video</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Share contact — full list + search (Alert only shows ~3 options on Android) */}
      <Modal
        visible={contactPickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setContactPickerOpen(false);
          setContactPickerQuery("");
          setContactPickerRows([]);
        }}
      >
        <View style={[styles.contactPickerRoot, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.contactPickerHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => {
                setContactPickerOpen(false);
                setContactPickerQuery("");
                setContactPickerRows([]);
              }}
              style={styles.contactPickerBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="arrow-back" size={24} color={colors.foreground} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[styles.contactPickerTitle, { color: colors.foreground }]}>Share contact</Text>
              <Text style={[styles.contactPickerSubtitle, { color: colors.mutedForeground }]}>
                Select a contact to send
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
          <View style={[styles.contactPickerSearch, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.contactPickerSearchInput, { color: colors.foreground }]}
              placeholder="Search name or number"
              placeholderTextColor={colors.mutedForeground}
              value={contactPickerQuery}
              onChangeText={setContactPickerQuery}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
          {contactPickerLoading ? (
            <View style={styles.contactPickerLoadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.contactPickerLoadingText, { color: colors.mutedForeground }]}>Loading contacts…</Text>
            </View>
          ) : (
            <SectionList
              sections={contactPickerSections}
              keyExtractor={(item) => item.id}
              stickySectionHeadersEnabled
              keyboardShouldPersistTaps="handled"
              renderSectionHeader={({ section: { title } }) => (
                <View style={[styles.contactPickerSectionHeader, { backgroundColor: colors.isDark ? "#1e2a30" : "#f0f2f5" }]}>
                  <Text style={[styles.contactPickerSectionTitle, { color: colors.primary }]}>{title}</Text>
                </View>
              )}
              renderItem={({ item }) => {
                const parts = item.name.trim().split(/\s+/).filter(Boolean);
                const initials =
                  parts.length >= 2
                    ? `${parts[0]![0]!}${parts[parts.length - 1]![0]!}`.toUpperCase()
                    : (item.name.replace(/\D/g, "").slice(-2) || item.name.charAt(0) || "?").toUpperCase();
                const hue = ((item.name.charCodeAt(0) || 32) * 37) % 360;
                return (
                  <TouchableOpacity
                    style={[styles.contactPickerRow, { borderBottomColor: colors.border }]}
                    onPress={() => confirmShareContact(item)}
                    activeOpacity={0.65}
                  >
                    <View style={[styles.contactPickerAvatar, { backgroundColor: `hsl(${hue},42%,42%)` }]}>
                      <Text style={styles.contactPickerAvatarTxt}>{initials.slice(0, 2)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.contactPickerName, { color: colors.foreground }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.phone ? (
                        <Text style={[styles.contactPickerPhone, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {item.phone}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.contactPickerEmpty}>
                  <Text style={[styles.contactPickerEmptyText, { color: colors.mutedForeground }]}>
                    {contactPickerQuery.trim() ? "No contacts match your search." : "No contacts to show."}
                  </Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            />
          )}
        </View>
      </Modal>

      {/* Reaction picker modal */}
      <DismissibleModal visible={!!reactionTarget} onClose={() => setReactionTarget(null)} animationType="fade">
        <View style={[styles.reactionPickerWrap, { paddingBottom: insets.bottom + 96 }]}>
          <View style={styles.reactionPicker}>
            {REACTION_EMOJIS.map((e) => (
              <TouchableOpacity key={e} style={styles.reactionPickerBtn} onPress={() => {
                if (chatId && reactionTarget) { reactToMessage(chatId, reactionTarget.id, e); }
                setReactionTarget(null);
              }}>
                <Text style={{ fontSize: 28 }}>{e}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.reactionPickerPlus} onPress={() => setReactionTarget(null)}>
              <Ionicons name="add" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>
      </DismissibleModal>

      {/* Delete modal — centered card (WhatsApp-style), not bottom sheet */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <View style={styles.deleteModalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDeleteTarget(null)} />
          <View style={styles.deleteCard}>
            <Text style={styles.deleteTitle}>Delete message?</Text>
            {deleteTarget?.senderId === "me" && (
              <TouchableOpacity
                style={styles.deleteAction}
                onPress={() => {
                  const target = deleteTarget;
                  setDeleteTarget(null);
                  if (chatId && target) deleteForEveryone(chatId, target.id);
                }}
              >
                <Text style={styles.deleteActionText}>Delete for everyone</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.deleteAction}
              onPress={() => {
                const target = deleteTarget;
                setDeleteTarget(null);
                if (chatId && target) deleteMessage(chatId, target.id);
              }}
            >
              <Text style={styles.deleteActionText}>Delete for me</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteAction} onPress={() => setDeleteTarget(null)}>
              <Text style={styles.deleteCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bulk delete (multi-select) */}
      <Modal visible={bulkDeleteOpen} transparent animationType="fade" onRequestClose={() => setBulkDeleteOpen(false)}>
        <View style={styles.deleteModalRoot}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setBulkDeleteOpen(false)} />
          <View style={styles.deleteCard}>
            <Text style={styles.deleteTitle}>Delete {selectedIds.length} messages?</Text>
            {bulkOthersCount > 0 ? (
              <Text style={[styles.bulkDeleteHint, { color: colors.mutedForeground }]}>
                Only messages you sent can be removed. {bulkOthersCount} from others will stay in the chat.
              </Text>
            ) : (
              <Text style={[styles.bulkDeleteHint, { color: colors.mutedForeground }]}>
                Removes selected messages you sent from this chat.
              </Text>
            )}
            {bulkHasMine ? (
              <>
                {bulkAllMineDeletable ? (
                  <TouchableOpacity
                    style={styles.deleteAction}
                    onPress={() => {
                      if (!chatId) return;
                      for (const m of bulkSelectedMessages) {
                        if (m.senderId === "me" && m.type !== "deleted") deleteForEveryone(chatId, m.id);
                      }
                      clearSelection();
                    }}
                  >
                    <Text style={styles.deleteActionText}>Delete for everyone</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.deleteAction}
                  onPress={() => {
                    if (!chatId) return;
                    for (const m of bulkSelectedMessages) {
                      if (m.senderId === "me" && m.type !== "deleted") deleteMessage(chatId, m.id);
                    }
                    clearSelection();
                  }}
                >
                  <Text style={styles.deleteActionText}>
                    {bulkAllMineDeletable ? "Delete for me" : "Delete my messages only"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={[styles.bulkDeleteHint, { color: colors.mutedForeground }]}>
                No messages you sent are selected.
              </Text>
            )}
            <TouchableOpacity style={styles.deleteAction} onPress={() => setBulkDeleteOpen(false)}>
              <Text style={styles.deleteCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Forward modal */}
      <DismissibleModal visible={!!forwardMsg} onClose={() => setForwardMsg(null)} animationType="slide">
        <View style={styles.forwardModalWrap}>
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
        </View>
      </DismissibleModal>

      <Modal visible={!!mediaPreview} animationType="fade" transparent onRequestClose={() => setMediaPreview(null)}>
        <Pressable style={styles.mediaPreviewModal} onPress={() => setMediaPreview(null)}>
          <View style={styles.mediaPreviewHeader}>
            <TouchableOpacity style={styles.mediaPreviewBtn} onPress={() => setMediaPreview(null)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {mediaPreview?.type === "image" && mediaPreview.uri ? (
              <TouchableOpacity
                style={styles.mediaPreviewSaveBtn}
                onPress={() => { void saveImageToGallery(mediaPreview.uri); }}
              >
                <Ionicons name="download-outline" size={20} color="#fff" />
                <Text style={styles.mediaPreviewSaveText}>Save</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {mediaPreview?.uri ? (
            <Image source={{ uri: mediaPreview.uri }} style={styles.mediaPreviewImage} contentFit="contain" />
          ) : null}
          {mediaPreview?.caption ? (
            <View style={styles.mediaPreviewCaptionWrap}>
              <Text style={styles.mediaPreviewCaption}>{mediaPreview.caption}</Text>
            </View>
          ) : null}
        </Pressable>
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
  selectionHeader: { backgroundColor: "#1f2c34" },
  selectionHeaderActions: { flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 },
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
  dateChipWrap: { alignItems: "center", paddingVertical: 10, paddingHorizontal: 16 },
  dateChipPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: "hidden",
  },
  dateChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 0.2 },
  msgSwipeRow: { width: "100%" },
  msgSwipeContainer: { overflow: "hidden" },
  msgRowOuter: { width: "100%", position: "relative" },
  msgRowOuterBleed: { marginHorizontal: -10 },
  swipeReplyRail: { justifyContent: "center", alignItems: "center" },
  msgWrap: { marginVertical: 2 },
  msgLeft: { alignItems: "flex-start" },
  msgRight: { alignItems: "flex-end" },
  fwdLabel: { flexDirection: "row", alignItems: "center", marginBottom: 2, paddingHorizontal: 4 },
  fwdText: { fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  bubbleTailWrap: { position: "relative", maxWidth: "82%" },
  bubbleTailSvg: { position: "absolute", bottom: 0, zIndex: 1 },
  bubble: {
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0.5 },
    shadowOpacity: 0.11,
    shadowRadius: 1.5,
  },
  /** Bottom corners even; SVG tail sits at corner */
  bubbleWithTailShape: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  bubbleDeleted: { paddingVertical: 7, paddingHorizontal: 9 },
  bubbleImg: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
    borderRadius: 12,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  replyStrip: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 5, paddingVertical: 2, borderRadius: 2, marginHorizontal: 0 },
  replyWho: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  replyText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  msgText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  msgImage: { width: W * 0.62, height: W * 0.62, borderRadius: 12 },
  msgVideo: { width: W * 0.62, height: W * 0.62, borderRadius: 12, backgroundColor: "#000" },
  videoThumbWrap: { position: "relative", width: W * 0.62, height: W * 0.62, borderRadius: 12, overflow: "hidden" },
  videoThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  videoThumbFooter: {
    position: "absolute",
    left: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  videoThumbDuration: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold", textShadowColor: "rgba(0,0,0,0.75)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  videoLoadingWrap: { width: W * 0.62, height: W * 0.62, borderRadius: 12, backgroundColor: "#111827", alignItems: "center", justifyContent: "center", gap: 6 },
  videoLoadingText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  videoErrorWrap: { width: W * 0.62, height: W * 0.62, borderRadius: 12, backgroundColor: "#111827", alignItems: "center", justifyContent: "center", gap: 6 },
  videoErrorText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium" },
  viewOnceOverlay: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  viewOnceText: { color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" },
  translatedBox: { marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.15)" },
  translatedLabel: { fontSize: 10, color: "#00A884", fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  docCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, minWidth: 220 },
  docIcon: { width: 48, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  docMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  locationBubbleWrap: { overflow: "hidden", borderRadius: 12, minWidth: W * 0.62, maxWidth: W * 0.82 },
  locationMapImg: { width: W * 0.62, height: 200, backgroundColor: "#dfe6e4" },
  locationLiveBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  locationLiveSmall: { fontSize: 11, fontFamily: "Inter_400Regular" },
  locationLiveTime: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 1 },
  locationAvatarOnMap: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: "#fff" },
  locationStaticFooter: { backgroundColor: "rgba(255,255,255,0.96)" },
  locationStaticTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  locationCoords: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 2 },
  stopShareRow: { paddingVertical: 12, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.96)" },
  stopShareText: { color: "#c62828", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  contactCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, minWidth: 220, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.1)" },
  contactCardAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#00A88440", alignItems: "center", justifyContent: "center" },
  contactCardAvatarTxt: { color: "#00A884", fontSize: 18, fontWeight: "700" },
  contactCardName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  contactCardPhone: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  contactCallBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#00A88420", alignItems: "center", justifyContent: "center" },
  linkPreview: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.1)" },
  linkText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  msgMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 3 },
  msgMetaOnMedia: {
    position: "absolute",
    right: 6,
    bottom: 6,
    marginTop: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  editedLabel: { fontSize: 10, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  msgTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  deletedRowWa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 1,
  },
  deletedIconWa: { marginTop: 1 },
  deletedTextWa: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    lineHeight: 19,
  },
  deletedTimeWa: { fontSize: 11, fontFamily: "Inter_400Regular", flexShrink: 0, paddingLeft: 4 },
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
  voiceRecordPanel: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginHorizontal: 6,
    marginBottom: 4,
    borderRadius: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  voiceRecTimer: { fontSize: 15, fontFamily: "Inter_600SemiBold", minWidth: 44 },
  voiceRecWaveRow: { flex: 1, flexDirection: "row", alignItems: "flex-end", height: 34, gap: 2, overflow: "hidden" },
  voiceRecBar: { width: 2.5, borderRadius: 1, alignSelf: "flex-end" },
  voiceRecIconBtn: { padding: 6 },
  voiceRecSendFab: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  groupLockBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  groupLockBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputIcon: { padding: 6 },
  inputField: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  deleteModalRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  attachModalRoot: { flex: 1, justifyContent: "flex-end" },
  attachBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)" },
  attachSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 10,
    elevation: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  attachHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  attachWaGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", paddingHorizontal: 6 },
  attachWaCell: { width: (W - 52) / 3, alignItems: "center", paddingVertical: 10 },
  attachWaCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  attachWaLabel: { fontSize: 13, fontFamily: "Inter_500Medium", textAlign: "center", maxWidth: (W - 52) / 3 },
  attachViewOnceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
  },
  attachWaCircleSm: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  attachViewOnceText: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  attachTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 16, textAlign: "center" },
  reactionPickerWrap: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  reactionPicker: { alignSelf: "center", flexDirection: "row", gap: 4, borderRadius: 28, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 8, elevation: 12, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  forwardModalWrap: { flex: 1, justifyContent: "flex-end" },
  reactionPickerBtn: { paddingHorizontal: 3, paddingVertical: 2 },
  reactionPickerPlus: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginLeft: 2, backgroundColor: "#f1f5f9" },
  deleteCard: {
    zIndex: 1,
    width: "100%",
    maxWidth: 340,
    borderRadius: 28,
    backgroundColor: "#fff",
    paddingVertical: 14,
    paddingHorizontal: 18,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  deleteTitle: {
    fontSize: 17,
    color: "#1c1e21",
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
    alignSelf: "stretch",
    textAlign: "left",
  },
  bulkDeleteHint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 12 },
  deleteAction: { paddingVertical: 10 },
  deleteActionText: { fontSize: 17, color: "#0f9d7a", fontFamily: "Inter_500Medium", textAlign: "center" },
  deleteCancelText: { fontSize: 17, color: "#64748b", fontFamily: "Inter_500Medium", textAlign: "center" },
  forwardSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "60%" },
  forwardRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  forwardAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  forwardName: { fontSize: 15, fontFamily: "Inter_500Medium", flex: 1 },
  mediaPreviewModal: { flex: 1, backgroundColor: "rgba(0,0,0,0.98)" },
  mediaPreviewHeader: { paddingTop: 46, paddingHorizontal: 12, paddingBottom: 8, flexDirection: "row", alignItems: "center" },
  mediaPreviewBtn: { padding: 8 },
  mediaPreviewSaveBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.14)" },
  mediaPreviewSaveText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  mediaPreviewImage: { flex: 1, width: "100%" },
  mediaPreviewCaptionWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 20, backgroundColor: "rgba(0,0,0,0.55)" },
  mediaPreviewCaption: { color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "left" },
  contactPickerRoot: { flex: 1 },
  contactPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactPickerBack: { padding: 8, marginRight: 4 },
  contactPickerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  contactPickerSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  contactPickerSearch: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    marginVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    gap: 8,
  },
  contactPickerSearchInput: { flex: 1, fontSize: 16, fontFamily: "Inter_400Regular", paddingVertical: 10 },
  contactPickerLoadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 48 },
  contactPickerLoadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  contactPickerSectionHeader: { paddingHorizontal: 16, paddingVertical: 6 },
  contactPickerSectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  contactPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactPickerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  contactPickerAvatarTxt: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  contactPickerName: { fontSize: 16, fontFamily: "Inter_500Medium" },
  contactPickerPhone: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  contactPickerEmpty: { padding: 40, alignItems: "center" },
  contactPickerEmptyText: { fontSize: 15, fontFamily: "Inter_400Regular", textAlign: "center" },
});
