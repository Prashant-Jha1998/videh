import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS, ResizeMode, Video } from "expo-av";
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from "expo-router";
import {
  AndroidSoftInputModes,
  KeyboardController,
  KeyboardStickyView,
  useGenericKeyboardHandler,
} from "react-native-keyboard-controller";
import { useChatKeyboard } from "@/hooks/useChatKeyboard";
import { onChatMessageSignal } from "@/lib/chatMessageEvents";
import { runOnJS } from "react-native-reanimated";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Clipboard,
  BackHandler,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  useWindowDimensions,
  Image as NativeImage,
  Keyboard,
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
import { Swipeable } from "react-native-gesture-handler";
import { useColors } from "@/hooks/useColors";
import { useChatAppearance } from "@/hooks/useChatAppearance";
import { AnimatedChatWallpaper } from "@/components/AnimatedChatWallpaper";
import { useUiPreferences } from "@/context/UiPreferencesContext";
import { useApp, type Message } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";
import { usePlayableVideoUri } from "@/lib/usePlayableVideoUri";
import { downloadPlayableAudioSource, usePlayableAudioUri } from "@/lib/usePlayableAudioUri";
import {
  CHAT_VIDEO_PICKER_OPTIONS,
  CHAT_VIEW_ONCE_PICKER_OPTIONS,
  validatePickedMedia,
  validatePickedAssets,
} from "@/lib/chatMediaPolicy";
import { validateGalleryAssets, type GalleryAsset } from "@/lib/galleryPicker";
import { ChatAttachSheet } from "@/components/ChatAttachSheet";
import { VidehVoiceMic } from "@/components/VidehVoiceMic";
import { CHAT_EMOJI_PANEL_HEIGHT, ChatEmojiPanel } from "@/components/ChatEmojiPanel";
import type { GifMediaItem } from "@/lib/chatGifApi";
import { uploadRemoteGifOrSticker } from "@/lib/sendChatGifSticker";
import { ChatCompactMessageText, ChatMessageText } from "@/components/ChatMessageText";
import { DocumentMessageBubble } from "@/components/DocumentMessageBubble";
import { CHAT_MESSAGE_MAX_CHARS } from "@/lib/chatMessageText";
import { ContactMessageBubble } from "@/components/ContactMessageBubble";
import { openChatDocument } from "@/lib/openChatDocument";
import { documentFilenameFromText, parseDocumentMessagePayload } from "@/lib/documentMessage";
import { dedupeEmails, dedupePhones, parseContactMessage } from "@/lib/contactMessage";
import type { ContactShareRow } from "@/lib/loadDeviceContactsForShare";
import { ContactSharePickerModal } from "@/components/ContactSharePickerModal";
import { claimVoicePlayback, releaseVoicePlayback } from "@/lib/voicePlaybackHub";
import {
  fallbackVoiceWaveHeights,
  parseVoiceDurationSec,
  parseVoiceWaveform,
  VOICE_WAVE_BAR_COUNT,
} from "@/lib/voiceWaveform";
import { guessMimeFromFilename } from "@/lib/prepareFileUpload";
import { stashBatchMedia } from "@/lib/chatMediaBatch";
import { uploadChatMediaWithProgress } from "@/lib/chatMediaUpload";
import { launchChatPhotoCamera, launchChatVideoCamera } from "@/lib/openChatCamera";
import { saveImageUriToLibrary } from "@/lib/saveImageToLibrary";
import { displayAlbumUrls, isAlbumMessage, resolveAlbumUrls } from "@/lib/chatAlbumMessage";
import { ChatAlbumGalleryModal } from "@/components/ChatAlbumGalleryModal";
import { isGifUri } from "@/lib/imageEdit";
import { authFetchHeaders } from "@/lib/authenticatedMedia";
import { formatTypingLabel } from "@/lib/typingIndicator";
import { TypingIndicator } from "@/components/TypingIndicator";
import { ChatAlbumBubble } from "@/components/ChatAlbumBubble";
import { MediaProgressRing } from "@/components/MediaProgressRing";
import { ChatSystemMessageBubble } from "@/components/ChatSystemMessageBubble";
import { GroupWelcomeCard } from "@/components/GroupWelcomeCard";
import { DisappearTimerBadge } from "@/components/DisappearTimerBadge";
import { isChatDisappearingEnabled, isDisappearingMessageExpired } from "@/lib/disappearTimerOptions";
import { formatChatBubbleTime } from "@/utils/time";
import {
  isChatNearBottom,
  isChatScrolledUp,
  isChatBackAtBottom,
  isCompactChatText,
  isInvertedChatNearBottom,
  isInvertedChatScrolledUp,
  isInvertedChatBackAtBottom,
  SCROLL_PIN_DEBOUNCE_MS,
  shouldAnimateChatPin,
  WHATSAPP_MVCP_FOLLOW_AUTOSCROLL_THRESHOLD,
  WHATSAPP_MVCP_HISTORY_AUTOSCROLL_THRESHOLD,
} from "@/lib/whatsappChatScroll";
import { extractUrls, primaryUrlFromText } from "@/lib/chatUrls";
import { ComposerLinkPreview } from "@/components/ComposerLinkPreview";
import { pickWebFile } from "@/lib/web/webFilePicker";
import { useWebKeyboardShortcuts } from "@/lib/useWebKeyboardShortcuts";
import { DismissibleModal } from "@/components/DismissibleModal";
import { DropdownMenu } from "@/components/DropdownMenu";
import { ThemedHeader } from "@/components/ThemedHeader";
import { BusinessIntroCard, BusinessSecureBanner, formatBusinessJoinedLabel } from "@/components/BusinessChatIntro";
import { ManageBusinessMessagesSheet } from "@/components/ManageBusinessMessagesSheet";
import { ChatEncryptionNotice, UnsavedContactCard } from "@/components/UnsavedContactCard";
import { dismissGroupWelcome, isGroupWelcomeDismissed } from "@/lib/groupWelcomeDismiss";
import {
  encodeLocationPayload,
  formatLiveRemaining,
  formatLiveUntil,
  isLiveLocationActive,
  isLiveLocationEnded,
  locationDisplayAddress,
  mapsUrl,
  openLocationInMaps,
  parseLegacyLocation,
  parseLocationPayload,
  rememberMapPreviewUrl,
  staticMapFallbackUrl,
  staticMapImageUrl,
} from "@/lib/locationMessage";
import { loadEnterIsSend, loadMediaVisibilityEnabled } from "@/lib/chatSettings";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";
import { safeJsonParse } from "@/lib/safeJson";
import { formatCallMessageLabel, parseCallMessageMeta } from "@/lib/callMessage";
import { normalizeMessageType } from "@/lib/normalizeMessage";
import { messageReplyPreviewText, replyQuoteSenderLabel } from "@/lib/messageReplyPreview";
import { downloadUrlToDevice } from "@/lib/web/webDownload";
import { formatPresenceSubtitle, type PresenceView } from "@/lib/presence";
import { setAssistantChatInputFocused } from "@/lib/assistantPause";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Path } from "react-native-svg";

const BASE_URL = getApiUrl();

const { width: W } = Dimensions.get("window");
const REACTION_EMOJIS = ["\u2764\uFE0F", "\uD83D\uDC4D", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDE22", "\uD83D\uDE4F"];
const REPLY_SWIPE_ACTION_W = 56;

type ChatListRow =
  | { rowType: "date"; id: string; label: string }
  | { rowType: "msg"; message: Message };

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Videh-style strip labels: Today, Yesterday, weekday, then dated. */
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

/** Inverted FlatList: index 0 = newest at visual bottom (WhatsApp RN pattern). */
function messagesWithDateRowsInverted(msgs: Message[]): ChatListRow[] {
  const out: ChatListRow[] = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    out.push({ rowType: "msg", message: m });
    const day = startOfLocalDay(m.timestamp);
    const hasOlderSameDay = i > 0 && startOfLocalDay(msgs[i - 1].timestamp) === day;
    if (!hasOlderSameDay) {
      out.push({
        rowType: "date",
        id: `date-${day}`,
        label: formatDateChipLabel(m.timestamp),
      });
    }
  }
  return out;
}

/** Small filled tail under the bubble corner (flat SVG, Videh-style). */
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

type ReplyData = { id: string; text: string; senderId: string; senderName?: string; type?: string } | null;

const REPLY_PREVIEW_TEXT_COLOR = "#667781";

function toReplyData(msg: {
  id: string;
  text: string;
  type: string;
  senderId: string;
  senderName?: string;
  isDeleted?: boolean;
}, messageFallback = "Message"): NonNullable<ReplyData> {
  const preview = messageReplyPreviewText({
    type: msg.type,
    text: msg.text,
    senderId: msg.senderId,
    isDeleted: msg.isDeleted || msg.type === "deleted",
  });
  return {
    id: msg.id,
    text: preview.trim() || messageFallback,
    senderId: msg.senderId,
    senderName: msg.senderName,
    type: msg.type,
  };
}

// Tick icons
function TickIcon({ status, color }: { status: Message["status"]; color: string }) {
  if (status === "read") return <Ionicons name="checkmark-done" size={14} color="#53BDEB" />;
  if (status === "delivered") return <Ionicons name="checkmark-done" size={14} color={color} />;
  return <Ionicons name="checkmark" size={14} color={color} />;
}

const VOICE_NOTE_WAVE_BARS = VOICE_WAVE_BAR_COUNT;

function formatVoiceClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/** Videh-style voice note: waveform, scrub, 1x / 1.5x / 2x, optional avatar on sent notes */
const VoiceNotePlayer = React.memo(function VoiceNotePlayer({
  uri,
  colors,
  isMe,
  messageId,
  messageText,
  durationHintSec,
  avatarUri,
  sessionToken,
}: {
  uri: string;
  colors: ReturnType<typeof useColors>;
  isMe: boolean;
  messageId: string;
  messageText: string;
  durationHintSec: number;
  avatarUri?: string;
  sessionToken?: string | null;
}) {
  const { playbackSource, failed, loading: uriLoading } = usePlayableAudioUri(uri, sessionToken);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(Math.max(0.1, durationHintSec || 0.1));
  const [position, setPosition] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [rate, setRate] = useState(1);
  const [ended, setEnded] = useState(false);
  const [waveW, setWaveW] = useState(0);
  const bars = useMemo(() => {
    const recorded = parseVoiceWaveform(messageText, VOICE_NOTE_WAVE_BARS);
    return recorded ?? fallbackVoiceWaveHeights(messageId + uri.slice(-24), VOICE_NOTE_WAVE_BARS);
  }, [messageText, messageId, uri]);

  const stopPlayback = useCallback(async () => {
    const s = soundRef.current;
    if (s) {
      try {
        await s.stopAsync();
      } catch { /* ignore */ }
    }
    setPlaying(false);
    releaseVoicePlayback(messageId);
  }, [messageId]);

  const disposeSoundRef = useCallback(async () => {
    const s = soundRef.current;
    soundRef.current = null;
    if (!s) return;
    try {
      await s.unloadAsync();
    } catch { /* ignore */ }
  }, []);

  const unloadSound = useCallback(async () => {
    await stopPlayback();
    await disposeSoundRef();
  }, [stopPlayback, disposeSoundRef]);

  const applyRate = useCallback(async (s: Audio.Sound, next: number) => {
    try {
      await s.setRateAsync(next, true);
    } catch { /* older platforms */ }
  }, []);

  const configureVoicePlaybackAudio = useCallback(async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    });
  }, []);

  const playFromStart = useCallback(async (s: Audio.Sound) => {
    const st = await s.getStatusAsync();
    if (st.isLoaded && st.isPlaying) {
      try {
        await s.stopAsync();
      } catch { /* ignore */ }
    }
    await s.setPositionAsync(0);
    try {
      await s.setVolumeAsync(1);
    } catch { /* ignore */ }
    await applyRate(s, rate);
    await s.playAsync();
    setPosition(0);
    setEnded(false);
    setPlaying(true);
  }, [applyRate, rate]);

  const loadSound = useCallback(async (source: NonNullable<typeof playbackSource>): Promise<Audio.Sound> => {
    const { sound: s } = await Audio.Sound.createAsync(
      source,
      { shouldPlay: false, volume: 1, rate: 1, progressUpdateIntervalMillis: 500 },
      (status) => {
        if (status.isLoaded) {
          setPosition((status.positionMillis ?? 0) / 1000);
          const d = (status.durationMillis ?? 0) / 1000;
          if (d > 0.05) setDuration(d);
          if (status.didJustFinish) {
            setPlaying(false);
            setEnded(true);
            setPosition(0);
            releaseVoicePlayback(messageId);
          }
        }
      },
    );
    await applyRate(s, rate);
    return s;
  }, [rate, applyRate, messageId]);

  const ensureSound = useCallback(async (forceDownload = false): Promise<Audio.Sound | null> => {
    if (!playbackSource) return null;

    if (!forceDownload) {
      const existing = soundRef.current;
      if (existing) {
        const st = await existing.getStatusAsync();
        if (st.isLoaded) return existing;
        await disposeSoundRef();
      }
    } else {
      await disposeSoundRef();
    }

    await configureVoicePlaybackAudio();

    let source = playbackSource;
    if (forceDownload) {
      try {
        source = await downloadPlayableAudioSource(source, sessionToken);
      } catch { /* keep original source */ }
    }

    try {
      const s = await loadSound(source);
      soundRef.current = s;
      return s;
    } catch {
      try {
        source = await downloadPlayableAudioSource(source, sessionToken);
        const s = await loadSound(source);
        soundRef.current = s;
        return s;
      } catch {
        return null;
      }
    }
  }, [playbackSource, sessionToken, configureVoicePlaybackAudio, disposeSoundRef, loadSound]);

  const startPlayback = useCallback(async (forceDownload: boolean): Promise<boolean> => {
    let s = await ensureSound(forceDownload);
    if (!s) return false;

    let status = await s.getStatusAsync();
    if (!status.isLoaded) {
      await disposeSoundRef();
      s = await ensureSound(true);
      if (!s) return false;
      status = await s.getStatusAsync();
      if (!status.isLoaded) return false;
    }

    await claimVoicePlayback(messageId, async () => {
      const active = soundRef.current;
      if (active) {
        try {
          await active.pauseAsync();
        } catch { /* ignore */ }
      }
      setPlaying(false);
    });
    await configureVoicePlaybackAudio();

    const atEnd =
      ended
      || ((status.durationMillis ?? 0) > 0
        && (status.positionMillis ?? 0) >= (status.durationMillis ?? 0) - 250);

    if (atEnd) {
      await playFromStart(s);
    } else {
      try {
        await s.setVolumeAsync(1);
      } catch { /* ignore */ }
      await applyRate(s, rate);
      await s.playAsync();
      setPlaying(true);
      setEnded(false);
    }
    return true;
  }, [ensureSound, disposeSoundRef, messageId, configureVoicePlaybackAudio, ended, playFromStart, applyRate, rate]);

  const toggle = async () => {
    if (uriLoading) return;
    if (!playbackSource) {
      if (failed) Alert.alert("Voice message", "Could not load this voice note. Check your connection and try again.");
      return;
    }
    try {
      setPreparing(true);

      if (playing) {
        const s = soundRef.current;
        if (s) await s.pauseAsync();
        setPlaying(false);
        releaseVoicePlayback(messageId);
        return;
      }

      const ok = await startPlayback(false);
      if (ok) return;

      // Silent one-time retry with a fresh local download before surfacing an error.
      await unloadSound();
      const retried = await startPlayback(true);
      if (!retried) {
        await unloadSound();
        setPlaying(false);
        Alert.alert("Voice message", "Could not play this voice note. Check your connection and try again.");
      }
    } catch {
      try {
        await unloadSound();
        const retried = await startPlayback(true);
        if (retried) return;
      } catch { /* ignore */ }
      await unloadSound();
      setPlaying(false);
      Alert.alert("Voice message", "Could not play this voice note. Check your connection and try again.");
    } finally {
      setPreparing(false);
    }
  };

  const cycleRate = async () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (soundRef.current) await applyRate(soundRef.current, next);
  };

  const seekFromX = async (x: number) => {
    const s = soundRef.current;
    if (!s || waveW <= 0 || duration <= 0) return;
    const p = Math.max(0, Math.min(1, x / waveW));
    try {
      await s.setPositionAsync(p * duration * 1000);
      setPosition(p * duration);
      setEnded(false);
    } catch { /* ignore */ }
  };

  useEffect(() => () => { void unloadSound(); }, [unloadSound]);

  useEffect(() => {
    void unloadSound();
    setPlaying(false);
    setEnded(false);
    setPosition(0);
  }, [playbackSource, unloadSound]);

  useEffect(() => {
    if (!soundRef.current) return;
    void applyRate(soundRef.current, rate);
  }, [rate, applyRate]);

  const total = Math.max(duration, 0.1);
  const prog = Math.min(Math.max(position / total, 0), 1);
  const remaining = Math.max(0, total - position);
  const inactiveBar = isMe ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.18)";
  const activeBar = isMe ? "rgba(0,0,0,0.45)" : "#5a6a72";
  const scrubLeft = waveW > 0 ? prog * waveW - 4 : 0;

  return (
    <View style={{ minWidth: 240, maxWidth: W * 0.78, paddingVertical: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 36, alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "relative" }}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" />
            ) : (
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#00A884", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="person" size={18} color="#fff" />
              </View>
            )}
            {isMe ? (
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
            ) : null}
          </View>
        </View>
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
          {preparing || uriLoading ? (
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
});

/** In-bubble preview: tap opens full-screen viewer (Videh-style). */
function ViewOncePlaceholderBubble({
  kind,
  onOpen,
}: {
  kind: "image" | "video";
  onOpen: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onOpen} style={styles.viewOncePlaceholder}>
      <Ionicons name={kind === "video" ? "videocam" : "image"} size={32} color="#8696a0" />
      <View style={styles.viewOncePlaceholderBadge}>
        <Ionicons name="eye-outline" size={14} color="#fff" />
        <Text style={styles.viewOnceText}>View once</Text>
      </View>
    </TouchableOpacity>
  );
}

function ViewOnceOpenedBubble({ kind }: { kind: "image" | "video" }) {
  return (
    <View style={styles.viewOnceOpened}>
      <Ionicons name={kind === "video" ? "videocam-outline" : "image-outline"} size={22} color="#8696a0" />
      <Text style={styles.viewOnceOpenedText}>{kind === "video" ? "Video" : "Photo"}</Text>
      <Text style={styles.viewOnceOpenedSub}>Opened</Text>
    </View>
  );
}

/** Quoted reply bar â€” tap scrolls to original message (WhatsApp-style). */
function ReplyQuoteStrip({
  senderLabel,
  previewText,
  isMe,
  accentColor,
  previewColor,
  onPress,
  contactFallback = "Contact",
  messageFallback = "Message",
}: {
  senderLabel: string;
  previewText: string;
  isMe: boolean;
  accentColor: string;
  previewColor: string;
  onPress: () => void;
  contactFallback?: string;
  messageFallback?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.replyStrip,
        {
          borderLeftColor: accentColor,
          backgroundColor: isMe ? "rgba(0,0,0,0.07)" : "rgba(0,0,0,0.05)",
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View style={styles.replyStripTextCol}>
        <Text style={[styles.replyWho, { color: accentColor }]} numberOfLines={1}>
          {senderLabel || contactFallback}
        </Text>
        <Text style={[styles.replyText, { color: previewColor }]} numberOfLines={2}>
          {previewText?.trim() || messageFallback}
        </Text>
      </View>
    </Pressable>
  );
}

function CallMessageBubble({
  meta,
  isMe,
  colors,
  onPress,
}: {
  meta: NonNullable<ReturnType<typeof parseCallMessageMeta>>;
  isMe: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const missed = meta.result === "missed";
  const iconName = meta.callType === "video"
    ? (missed && !isMe ? "videocam-off" : "videocam")
    : (missed && !isMe ? "call" : "call");
  const tint = missed && !isMe ? "#ef4444" : isMe ? "#008069" : colors.primary;
  const label = formatCallMessageLabel(meta, isMe);
  return (
    <TouchableOpacity style={styles.callBubble} onPress={onPress} activeOpacity={0.85}>
      <Ionicons
        name={iconName as any}
        size={20}
        color={tint}
        style={[styles.callBubbleIcon, { transform: [{ rotate: missed && isMe ? "135deg" : "0deg" }] }]}
      />
      <Text style={[styles.callBubbleText, { color: colors.foreground }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** In-bubble preview: tap opens full-screen viewer (Videh-style). */
function ChatVideoThumbnailBubble({ uri, sessionToken, onOpen }: { uri: string; sessionToken?: string | null; onOpen: () => void }) {
  const { playableUri, failed, loading } = usePlayableVideoUri(uri, sessionToken);
  const [durationSec, setDurationSec] = useState(0);
  const [thumbFailed, setThumbFailed] = useState(false);

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
      {thumbFailed ? (
        <View style={[styles.msgVideo, styles.videoFallbackBg]} />
      ) : (
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
          onError={() => setThumbFailed(true)}
        />
      )}
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

function MediaUploadOverlay({
  uploading,
  failed,
  progress,
}: {
  uploading: boolean;
  failed?: boolean;
  progress: number;
}) {
  if (!uploading && !failed) return null;
  return (
    <View style={styles.mediaUploadOverlay} pointerEvents="none">
      <View style={styles.mediaUploadDim} />
      {failed ? (
        <View style={styles.mediaUploadCenter}>
          <Ionicons name="alert-circle" size={32} color="#fff" />
          <Text style={styles.mediaUploadFailedText}>Couldn&apos;t send</Text>
        </View>
      ) : (
        <MediaProgressRing
          size={48}
          strokeWidth={3}
          progress={progress}
          progressColor="#00A884"
          trackColor="rgba(255,255,255,0.35)"
        >
          <Text style={styles.mediaUploadPct}>{progress}%</Text>
        </MediaProgressRing>
      )}
    </View>
  );
}

function ChatImageBubble({
  uri,
  sessionToken,
  onOpen,
}: {
  uri: string;
  sessionToken?: string | null;
  onOpen: () => void;
}) {
  const [useNativeFallback, setUseNativeFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const needsAuth = uri.includes("/api/chats/media/") && sessionToken;
  const imageSource = needsAuth
    ? { uri, headers: authFetchHeaders(sessionToken) as Record<string, string> }
    : { uri };

  if (failed) {
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={onOpen} style={[styles.msgImage, styles.imageFallbackBg]}>
        <Ionicons name="image-outline" size={32} color="rgba(255,255,255,0.9)" />
        <Text style={styles.imageFallbackText}>Tap to open image</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onOpen}>
      {useNativeFallback ? (
        <NativeImage
          source={imageSource}
          style={styles.msgImage}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Image
          source={imageSource}
          style={styles.msgImage}
          contentFit="cover"
          onError={() => setUseNativeFallback(true)}
        />
      )}
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
  const [mapFailed, setMapFailed] = useState(false);
  const [mapFallback, setMapFallback] = useState(false);
  const [, setTick] = useState(0);
  const parsed = parseLocationPayload(item.text);
  const legacy = !parsed ? parseLegacyLocation(item.text) : null;
  const lat = parsed?.lat ?? legacy?.lat ?? 0;
  const lng = parsed?.lng ?? legacy?.lng ?? 0;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  const mapW = Math.round(W * 0.62 * 2);
  const mapH = 360;
  const mapPreview = hasCoords
    ? (mapFallback
      ? staticMapFallbackUrl(lat, lng, mapW, mapH, 15)
      : staticMapImageUrl(lat, lng, mapW, mapH, 15))
    : "";
  const liveActive = isLiveLocationActive(parsed);
  const liveEnded = isLiveLocationEnded(parsed);
  const untilMs = parsed?.until;
  const title = liveEnded
    ? "Live location ended"
    : liveActive
      ? "Live location"
      : "Location";
  const address = locationDisplayAddress(parsed, legacy ? item.text : undefined);
  const footerMuted = colors.mutedForeground;

  useEffect(() => {
    setMapFailed(false);
    setMapFallback(false);
  }, [lat, lng]);

  useEffect(() => {
    if (!liveActive || !untilMs) return;
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, [liveActive, untilMs]);

  const openMaps = useCallback(() => {
    if (!hasCoords) return;
    void openLocationInMaps(lat, lng);
  }, [hasCoords, lat, lng]);

  return (
    <View style={styles.locationBubbleWrap}>
      <Pressable
        onPress={openMaps}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${address}. Open in Maps`}
        style={styles.locationMapPreview}
      >
        <View style={styles.locationMapFallback}>
          <View style={[styles.locationMapPatch, styles.locationMapPatchA]} />
          <View style={[styles.locationMapPatch, styles.locationMapPatchB]} />
          <View style={[styles.locationMapRoad, styles.locationMapRoadH]} />
          <View style={[styles.locationMapRoad, styles.locationMapRoadV]} />
          <View style={[styles.locationMapRoad, styles.locationMapRoadDiag]} />
          <View style={styles.locationMapRiver} />
        </View>
        {mapPreview && !mapFailed ? (
          <Image
            source={{ uri: mapPreview }}
            style={styles.locationMapImg}
            contentFit="cover"
            onLoad={() => rememberMapPreviewUrl(lat, lng, mapW, mapH, mapPreview)}
            onError={() => {
              if (!mapFallback) {
                setMapFallback(true);
                return;
              }
              setMapFailed(true);
            }}
          />
        ) : null}
        <View style={styles.locationMapTint} pointerEvents="none" />
        <View style={styles.locationPinWrap} pointerEvents="none">
          {liveActive && userAvatar ? (
            <Image source={{ uri: userAvatar }} style={styles.locationAvatarPin} contentFit="cover" />
          ) : (
            <View style={styles.locationPinCircle}>
              <Ionicons name="location" size={25} color="#fff" />
            </View>
          )}
          <View style={styles.locationPinStem} />
        </View>
        <View style={styles.locationMapCredit} pointerEvents="none">
          <Text style={styles.locationMapCreditText}>{mapFailed ? "Map preview" : "Open in Maps"}</Text>
        </View>
      </Pressable>
      <Pressable onPress={openMaps} style={[styles.locationStaticFooter, { backgroundColor: colors.card }]}>
        <Text style={[styles.locationStaticTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.locationCoords, { color: footerMuted }]} numberOfLines={2}>
          {address}
        </Text>
        {liveActive && untilMs ? (
          <View style={styles.locationLiveMeta}>
            <Text style={[styles.locationLiveSmall, { color: footerMuted }]}>
              Live until {formatLiveUntil(untilMs)}
            </Text>
            <Text style={[styles.locationLiveSmall, { color: footerMuted }]}>
              {formatLiveRemaining(untilMs)}
            </Text>
          </View>
        ) : null}
        {hasCoords ? (
          <View style={styles.locationOpenMapsRow}>
            <Ionicons name="navigate" size={14} color={colors.primary} />
            <Text style={[styles.locationOpenMapsText, { color: colors.primary }]}>Open in Maps</Text>
          </View>
        ) : null}
      </Pressable>
      {liveActive && isMe && chatId ? (
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
    chats, user, sendMessage, sendImageMessage, sendPreparedMediaMessage, consumeViewOnceMessage, sendAudioMessage,
    sendDocumentMessage, cancelDocumentUpload, sendContactMessage,
    setTyping, clearTyping, markAsRead, deleteMessage, deleteForEveryone,
    editMessage, reactToMessage, starMessage, keepMessage, muteChat, createDirectChat,
    blockUser, unblockUser, reportUser,
    loadMessages, loadOlderMessages, forwardMessage, updateLocationOnServer, stopLiveLocationSession, setActiveChatId,
    typingByChatId, reportRemoteTyping, patchChatMessage,
  } = useApp();

  const [chatId, setChatId] = useState<string | null>(rawId?.startsWith("new_") ? null : rawId ?? null);
  const [initializing, setInitializing] = useState(rawId?.startsWith("new_") ?? false);
  const [messagesReady, setMessagesReady] = useState(false);
  const [disappearAfterSeconds, setDisappearAfterSeconds] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [peerPresence, setPeerPresence] = useState<PresenceView | null>(null);

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
  const [forwardIds, setForwardIds] = useState<string[]>([]);
  const [forwardSearch, setForwardSearch] = useState("");

  // Share contact â€” full-screen picker (Alert.alert only fits ~3 buttons on Android)
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactToConfirm, setContactToConfirm] = useState<ContactShareRow | null>(null);
  const [viewContactMsg, setViewContactMsg] = useState<Message | null>(null);

  // Edit mode
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");

  const [voiceRecPhase, setVoiceRecPhase] = useState<"idle" | "holding" | "locked">("idle");
  const [enterIsSend, setEnterIsSend] = useState(false);
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
  const [textSelection, setTextSelection] = useState({ start: 0, end: 0 });

  const handleVoiceNoteSend = useCallback((uri: string, durationSec: number, waveform: number[]) => {
    if (!chatId) return;
    sendAudioMessage(chatId, uri, durationSec, waveform);
  }, [chatId, sendAudioMessage]);

  const baseColors = useColors();
  const chatLook = useChatAppearance(chatId);
  const colors = useMemo(() => {
    const accent = chatLook.appearance.accent[0];
    const accentPair = chatLook.appearance.accent;
    return {
      ...baseColors,
      primary: accent,
      accent,
      tint: accent,
      headerBg: chatLook.isDark ? baseColors.headerBg : accent,
      statusRing: accent,
      onlineGreen: accent,
      appThemeColors: accentPair,
      chatBubbleSent: chatLook.chatBubbleSent,
      chatBubbleReceived: chatLook.chatBubbleReceived,
      chatBackground: chatLook.chatBackground,
    };
  }, [baseColors, chatLook]);
  const headerAccent = chatLook.appearance.accent;
  const { chatFontScale, t } = useUiPreferences();
  const messageFallback = t("common.message");
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const messagePollInFlightRef = useRef(false);
  const typingPollInFlightRef = useRef(false);
  const chatMetaRef = useRef<{ peerId?: number; isGroup: boolean }>({ isGroup: false });

  useEffect(() => {
    if (!rawId?.startsWith("new_")) return;
    const otherUId = otherUserIdParam ? Number(otherUserIdParam) : Number(rawId.replace("new_", ""));
    if (!otherUId) { setInitializing(false); return; }
    createDirectChat(otherUId, name ?? "Chat", otherAvatar ?? undefined)
      .then((realId) => { setChatId(realId); setInitializing(false); })
      .catch(() => setInitializing(false));
  }, [rawId]);

  useEffect(() => {
    if (!chatId) {
      setMessagesReady(false);
      return;
    }
    setMessagesReady(false);
    markAsRead(chatId);
    void loadMessages(chatId).finally(() => setMessagesReady(true));
  }, [chatId]);

  useEffect(() => {
    const c = chats.find((x) => x.id === chatId);
    chatMetaRef.current = { peerId: c?.otherUserId, isGroup: !!c?.isGroup };
  }, [chatId, chats]);

  const remoteTypingNames = chatId ? (typingByChatId[chatId] ?? []) : [];
  const scheduleOpenChatPinRef = useRef<() => void>(() => {});
  const messagesReadyRef = useRef(false);
  const messagesLenRef = useRef(0);

  // Live messages: 1s poll + push/SSE signal + AppContext backup (WhatsApp-style instant)
  useFocusEffect(
    useCallback(() => {
      void loadEnterIsSend().then(setEnterIsSend);
      if (!chatId) return;
      pendingScrollToEndRef.current = true;
      openChatPinDoneRef.current = false;
      userScrolledUpRef.current = false;
      readingHistoryRef.current = false;
      setReadingHistory(false);
      lastNearBottomRef.current = true;
      setShowJumpToLatest((p) => (p ? false : p));
      setUnreadBelowCount((p) => (p > 0 ? 0 : p));
      setActiveChatId(chatId);
      void loadMessages(chatId);
      const syncDisappearTimer = async () => {
        try {
          const res = await fetch(`${BASE_URL}/api/chats/${chatId}/details`);
          const data = await res.json() as {
            success?: boolean;
            chat?: { disappear_after_seconds?: number | null };
          };
          if (data.success && data.chat) {
            setDisappearAfterSeconds(data.chat.disappear_after_seconds ?? null);
          }
        } catch { /* ignore */ }
      };
      void syncDisappearTimer();
      const typingAuthHeaders: Record<string, string> = {};
      if (user?.sessionToken) typingAuthHeaders.Authorization = `Bearer ${user.sessionToken}`;
      const pollTyping = async () => {
        if (!user?.dbId || typingPollInFlightRef.current) return;
        typingPollInFlightRef.current = true;
        try {
          const res = await fetch(
            `${BASE_URL}/api/chats/${chatId}/typing?userId=${user.dbId}`,
            { headers: typingAuthHeaders },
          );
          const data = await res.json() as { typing?: string[] };
          reportRemoteTyping(chatId, data.typing ?? []);
        } catch {
          /* ignore */
        } finally {
          typingPollInFlightRef.current = false;
        }
      };
      const pollMessages = (force = false) => {
        if (!force && messagePollInFlightRef.current) return;
        messagePollInFlightRef.current = true;
        loadMessages(chatId).finally(() => { messagePollInFlightRef.current = false; });
      };
      const msgTimer = setInterval(() => pollMessages(false), 5000);
      void pollMessages(true);
      void pollTyping();
      const typingTimer = setInterval(pollTyping, 4000);
      const unsubMsgSignal = onChatMessageSignal((signal) => {
        if (String(signal.chatId) !== String(chatId)) return;
        // Incoming messages update `messages.length`; scroll only when following (see messages effect).
      });
      const { peerId, isGroup: isGroupChat } = chatMetaRef.current;
      const loadPresence = async () => {
        if (!peerId || isGroupChat) {
          setPeerPresence(null);
          return;
        }
        try {
          const stored = await AsyncStorage.getItem("videh_user");
          const token = safeJsonParse<{ sessionToken?: string } | null>(stored, null)?.sessionToken;
          const res = await fetch(`${BASE_URL}/api/users/${peerId}/presence`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const data = await res.json() as { success?: boolean; presence?: PresenceView };
          if (data.success && data.presence) setPeerPresence(data.presence);
        } catch {
          // keep previous
        }
      };
      void loadPresence();
      const presenceTimer = !isGroupChat && peerId ? setInterval(loadPresence, 12000) : null;

      return () => {
        unsubMsgSignal();
        setActiveChatId(null);
        clearTyping(chatId);
        reportRemoteTyping(chatId, []);
        clearInterval(msgTimer);
        clearInterval(typingTimer);
        if (presenceTimer) clearInterval(presenceTimer);
      };
    }, [chatId, user?.dbId, user?.sessionToken, setActiveChatId, loadMessages, clearTyping, reportRemoteTyping])
  );

  const enterSendActive = enterIsSend;

  const chat = chats.find((c) => c.id === chatId);
  useEffect(() => {
    setDisappearAfterSeconds(chat?.disappearAfterSeconds ?? null);
  }, [chat?.disappearAfterSeconds, chatId]);
  const disappearingOn = isChatDisappearingEnabled(disappearAfterSeconds);
  const allMessages = useMemo(
    () => (chat?.messages ?? []).filter((m) => !isDisappearingMessageExpired(m)),
    [chat?.messages],
  );
  const selectionActive = selectedIds.length > 0;
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setBulkDeleteOpen(false);
    setReactionTarget(null);
  }, []);

  /** Close reaction bar only — keep message selected for delete / forward / etc. */
  const dismissReactionPicker = useCallback(() => {
    setReactionTarget(null);
  }, []);

  const messages = searching && searchQuery.trim()
    ? allMessages.filter((m) => m.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : allMessages;

  const messagesForDisplay = useMemo(() => {
    return [...messages].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [messages]);

  const listRows = useMemo(() => messagesWithDateRows(messagesForDisplay), [messagesForDisplay]);
  const listRowsInverted = useMemo(() => messagesWithDateRowsInverted(messagesForDisplay), [messagesForDisplay]);
  const chatListData = searching ? listRows : listRowsInverted;
  const [composerHeight, setComposerHeight] = useState(56);
  const [readingHistory, setReadingHistory] = useState(false);
  const chatContactName = name ?? chat?.name ?? "Chat";

  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const listExtraData = useMemo(
    () => `${selectedIds.length}|${flashMessageId ?? ""}|${readingHistory ? 1 : 0}`,
    [selectedIds.length, flashMessageId, readingHistory],
  );
  const flashAnim = useRef(new Animated.Value(0)).current;
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToQuotedMessage = useCallback((quotedId: string) => {
    const rows = searching ? listRows : listRowsInverted;
    const index = rows.findIndex((r) => r.rowType === "msg" && r.message.id === quotedId);
    if (index < 0) {
      Alert.alert("Message not found", "This message is not loaded. Scroll up to load older messages.");
      return;
    }
    if (__DEV__) {
      console.log(`[chat-scroll] scrollToQuotedMessage intent=quote blocked=false index=${index}`);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashMessageId(quotedId);
    flashAnim.setValue(0);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 180, useNativeDriver: false }),
      Animated.timing(flashAnim, { toValue: 0, duration: 700, useNativeDriver: false }),
    ]).start();
    flashTimerRef.current = setTimeout(() => setFlashMessageId(null), 950);
  }, [listRows, listRowsInverted, searching, flashAnim]);

  const peerNameForVideo = name ?? chat?.name ?? "Chat";

  const videhForwardTargets = useMemo(() => {
    const q = forwardSearch.trim().toLowerCase();
    return chats.filter((c) => {
      if (!c.id || c.id.startsWith("new_") || c.id === chatId) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q);
    });
  }, [chats, chatId, forwardSearch]);

  const headerStatusText = useMemo(() => {
    if (remoteTypingNames.length > 0) {
      return formatTypingLabel(remoteTypingNames, chat?.isGroup);
    }
    if (chat?.isGroup) return `${chat.members?.length ?? ""} members`;
    if (initializing) return "connecting...";
    const fromPresence = formatPresenceSubtitle(peerPresence ?? undefined);
    if (fromPresence) return fromPresence;
    if (chat?.isOnline) return "online";
    return "";
  }, [remoteTypingNames, chat?.isGroup, chat?.members?.length, chat?.isOnline, initializing, peerPresence]);

  const [groupSendPermission, setGroupSendPermission] = useState<{ canSend: boolean; policy: string } | null>(null);
  const [blockState, setBlockState] = useState<{ iBlockedThem: boolean; theyBlockedMe: boolean }>({ iBlockedThem: false, theyBlockedMe: false });
  const [peerContactPreview, setPeerContactPreview] = useState<{
    phone: string;
    profileName: string;
    isSavedInDevice: boolean;
    commonGroupCount: number;
  } | null>(null);
  const [businessChannelInfo, setBusinessChannelInfo] = useState<{
    displayName: string;
    logoUrl?: string;
    joinedAt?: string | null;
  } | null>(null);
  const [manageBusinessOpen, setManageBusinessOpen] = useState(false);
  const [groupWelcomeDismissed, setGroupWelcomeDismissed] = useState(false);
  const [groupWelcomePreview, setGroupWelcomePreview] = useState<{
    addedByPhone: string;
    addedByName?: string;
    creatorIsContact: boolean;
    memberCount: number;
    contactsInGroupCount: number;
    createdAtMs: number;
    createdByUserId: number;
  } | null>(null);

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
            remoteUri: encodeURIComponent(playUri),
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

  const goToMediaCompose = useCallback((
    picked: { uri: string; kind: "image" | "video"; width?: number; height?: number },
    viewOnce: boolean,
  ) => {
    if (!chatId) return;
    router.push({
      pathname: "/chat/media-compose",
      params: {
        chatId,
        uri: encodeURIComponent(picked.uri),
        kind: picked.kind,
        viewOnce: viewOnce ? "1" : "0",
        ...(picked.kind === "image" && picked.width ? { imgW: String(picked.width) } : {}),
        ...(picked.kind === "image" && picked.height ? { imgH: String(picked.height) } : {}),
      },
    } as unknown as Parameters<typeof router.push>[0]);
  }, [chatId, router]);

  const goToDocumentCompose = useCallback((
    picked: { uri: string; name: string; size: number; mime: string },
  ) => {
    if (!chatId) return;
    router.push({
      pathname: "/chat/document-compose",
      params: {
        chatId,
        uri: encodeURIComponent(picked.uri),
        name: encodeURIComponent(picked.name),
        size: String(picked.size),
        mime: encodeURIComponent(picked.mime),
      },
    } as unknown as Parameters<typeof router.push>[0]);
  }, [chatId, router]);

  const goToMediaComposeBatch = useCallback(async (
    items: Array<{ uri: string; kind: "image" | "video" }>,
    viewOnce: boolean,
  ) => {
    if (!chatId || items.length === 0) return;
    await stashBatchMedia({ chatId, viewOnce, items });
    router.push({ pathname: "/chat/media-compose-batch" } as unknown as Parameters<typeof router.push>[0]);
  }, [chatId, router]);

  const openViewOnceMedia = useCallback(async (item: Message) => {
    if (!chatId) return;
    const kind = item.type === "video" ? "video" : "image";
    try {
      let mediaUrl = item.mediaUrl;
      if (item.senderId !== "me") {
        mediaUrl = (await consumeViewOnceMessage(chatId, item.id)) ?? undefined;
      }
      if (!mediaUrl) {
        Alert.alert("Unavailable", "This view-once message was already opened.");
        return;
      }
      if (kind === "video") {
        await openChatVideoFullScreen(mediaUrl, item.senderId === "me", item.timestamp);
      } else {
        setMediaPreview({
          uri: mediaUrl,
          type: "image",
          caption: item.text && item.text !== "ðŸ“· Photo" && item.text !== "ðŸ” View once" ? item.text : undefined,
        });
      }
    } catch (e) {
      Alert.alert("Could not open", e instanceof Error ? e.message : "Try again.");
    }
  }, [chatId, consumeViewOnceMessage, openChatVideoFullScreen]);

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
  const listRef = useRef<FlatList<ChatListRow>>(null);
  const pendingScrollToEndRef = useRef(true);
  const userScrolledUpRef = useRef(false);
  const readingHistoryRef = useRef(false);
  const keyboardVisibleRef = useRef(false);
  const keyboardAnimatingRef = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [dismissedComposerLink, setDismissedComposerLink] = useState<string | null>(null);
  const frozenMessageCountRef = useRef(0);
  const hasMoreOlderRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const lastOlderLoadAtRef = useRef(0);
  const scrollLockRef = useRef(false);
  const userDraggingRef = useRef(false);
  const hadRemoteTypingRef = useRef(false);
  const openChatPinDoneRef = useRef(false);
  const pendingPinAnimatedRef = useRef(false);
  const lastPinAtRef = useRef(0);
  const lastNearBottomRef = useRef(true);
  const scrollCoalesceRef = useRef<number | null>(null);
  const composerPinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  type ChatScrollIntent = "auto" | "fab" | "open" | "quote";

  const applyReadingHistoryMode = useCallback((on: boolean) => {
    readingHistoryRef.current = on;
    setReadingHistory(on);
  }, []);

  const blocksAutoScroll = useCallback(() => {
    return userScrolledUpRef.current || readingHistoryRef.current;
  }, []);

  const logScrollRequest = useCallback(
    (source: string, intent: ChatScrollIntent, blocked: boolean) => {
      if (__DEV__) {
        console.log(
          `[chat-scroll] ${source} intent=${intent} blocked=${blocked} scrolledUp=${userScrolledUpRef.current} readingHistory=${readingHistoryRef.current}`,
        );
      }
    },
    [],
  );

  const cancelAllScrollPins = useCallback(() => {
    if (composerPinTimerRef.current) {
      clearTimeout(composerPinTimerRef.current);
      composerPinTimerRef.current = null;
    }
    if (scrollCoalesceRef.current != null) {
      cancelAnimationFrame(scrollCoalesceRef.current);
      scrollCoalesceRef.current = null;
    }
    pendingPinAnimatedRef.current = false;
  }, []);
  const forceScrollToLatest = useCallback((
    animated = false,
    opts?: { bypassDrag?: boolean; intent?: ChatScrollIntent; source?: string },
  ) => {
    const intent = opts?.intent ?? "auto";
    const source = opts?.source ?? "forceScrollToLatest";
    const autoBlocked = intent === "auto" && blocksAutoScroll();
    logScrollRequest(source, intent, autoBlocked);
    if (autoBlocked) return;
    if (!opts?.bypassDrag && userDraggingRef.current) return;
    pendingPinAnimatedRef.current = pendingPinAnimatedRef.current || animated;
    if (scrollCoalesceRef.current != null) return;
    scrollCoalesceRef.current = requestAnimationFrame(() => {
      scrollCoalesceRef.current = null;
      const useAnimated = pendingPinAnimatedRef.current;
      pendingPinAnimatedRef.current = false;
      lastPinAtRef.current = Date.now();
      if (searching) {
        listRef.current?.scrollToEnd({ animated: useAnimated });
      } else {
        listRef.current?.scrollToOffset({ offset: 0, animated: useAnimated });
      }
    });
  }, [searching, blocksAutoScroll, logScrollRequest]);
  const pinToLatest = useCallback(
    (animated = false, opts?: { force?: boolean; source?: string }) => {
      const source = opts?.source ?? "pinToLatest";
      const intent: ChatScrollIntent = opts?.force ? "open" : "auto";
      if (userDraggingRef.current) {
        logScrollRequest(source, intent, true);
        return;
      }
      if (scrollLockRef.current && !opts?.force) return;
      if (!opts?.force && (blocksAutoScroll() || searching)) {
        logScrollRequest(source, intent, true);
        return;
      }
      const now = Date.now();
      if (!animated && !opts?.force && now - lastPinAtRef.current < SCROLL_PIN_DEBOUNCE_MS) return;
      forceScrollToLatest(animated, { intent, source });
    },
    [searching, blocksAutoScroll, logScrollRequest, forceScrollToLatest],
  );
  const scrollToLatestIfFollowing = useCallback(
    (animated = false, source = "scrollToLatestIfFollowing") => {
      pinToLatest(animated, { source });
    },
    [pinToLatest],
  );
  const scrollToLatest = scrollToLatestIfFollowing;
  const scheduleOpenChatPin = useCallback(() => {
    if (openChatPinDoneRef.current) return;
    openChatPinDoneRef.current = true;
    cancelAllScrollPins();
    pendingScrollToEndRef.current = false;
    userScrolledUpRef.current = false;
    applyReadingHistoryMode(false);
    lastNearBottomRef.current = true;
    setShowJumpToLatest((p) => (p ? false : p));
    setUnreadBelowCount((p) => (p > 0 ? 0 : p));
    pinToLatest(false, { force: true, source: "scheduleOpenChatPin" });
  }, [cancelAllScrollPins, pinToLatest, applyReadingHistoryMode]);
  const markUserScrolledUp = useCallback(() => {
    if (userScrolledUpRef.current) return;
    cancelAllScrollPins();
    pendingScrollToEndRef.current = false;
    userScrolledUpRef.current = true;
    applyReadingHistoryMode(true);
    lastNearBottomRef.current = false;
    frozenMessageCountRef.current = messages.length;
    setShowJumpToLatest(true);
  }, [cancelAllScrollPins, applyReadingHistoryMode, messages.length]);
  const pinChatToBottom = useCallback(
    (animated = false) => {
      cancelAllScrollPins();
      userDraggingRef.current = false;
      scrollLockRef.current = false;
      userScrolledUpRef.current = false;
      applyReadingHistoryMode(false);
      lastNearBottomRef.current = true;
      setShowJumpToLatest((p) => (p ? false : p));
      setUnreadBelowCount((p) => (p > 0 ? 0 : p));
      frozenMessageCountRef.current = messages.length;
      pendingScrollToEndRef.current = false;
      forceScrollToLatest(animated, { bypassDrag: true, intent: "fab", source: "pinChatToBottom" });
    },
    [messages.length, cancelAllScrollPins, forceScrollToLatest, applyReadingHistoryMode],
  );
  const scrollToBottomIfFollowing = useCallback(
    (animated = true) => {
      if (!userScrolledUpRef.current) pinChatToBottom(animated);
    },
    [pinChatToBottom],
  );
  scheduleOpenChatPinRef.current = scheduleOpenChatPin;
  const syncScrollAwayFromBottom = useCallback(
    (contentOffsetY: number, contentHeight: number, layoutHeight: number) => {
      const away = searching
        ? isChatScrolledUp(contentOffsetY, contentHeight, layoutHeight, userScrolledUpRef.current)
        : isInvertedChatScrolledUp(contentOffsetY, userScrolledUpRef.current);
      lastNearBottomRef.current = searching
        ? !away
        : isInvertedChatNearBottom(contentOffsetY);
      if (away && !userScrolledUpRef.current) {
        markUserScrolledUp();
      }
    },
    [markUserScrolledUp, searching],
  );
  const tryClearReadingHistory = useCallback(
    (contentOffsetY: number, contentHeight: number, layoutHeight: number) => {
      if (!userScrolledUpRef.current) return;
      const backAtBottom = searching
        ? isChatBackAtBottom(contentOffsetY, contentHeight, layoutHeight)
        : isInvertedChatBackAtBottom(contentOffsetY);
      if (!backAtBottom) return;
      cancelAllScrollPins();
      userScrolledUpRef.current = false;
      applyReadingHistoryMode(false);
      lastNearBottomRef.current = true;
      frozenMessageCountRef.current = messages.length;
      setShowJumpToLatest((p) => (p ? false : p));
      setUnreadBelowCount((p) => (p > 0 ? 0 : p));
    },
    [messages.length, cancelAllScrollPins, applyReadingHistoryMode, searching],
  );
  const finishScrollInteraction = useCallback(
    (contentOffsetY: number, contentHeight: number, layoutHeight: number) => {
      syncScrollAwayFromBottom(contentOffsetY, contentHeight, layoutHeight);
      tryClearReadingHistory(contentOffsetY, contentHeight, layoutHeight);
      if (!blocksAutoScroll() && !searching && lastNearBottomRef.current) {
        pinToLatest(false, { source: "finishScrollInteraction" });
      }
    },
    [syncScrollAwayFromBottom, tryClearReadingHistory, searching, blocksAutoScroll, pinToLatest],
  );
  const tryLoadOlderMessages = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreOlderRef.current || searching || !chatId) return;
    const oldest = messages.find((m) => !m.id.startsWith("tmp_"));
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const { hasMore } = await loadOlderMessages(chatId, oldest.timestamp);
      hasMoreOlderRef.current = hasMore;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [chatId, loadOlderMessages, messages, searching]);
  const handleListScroll = useCallback(
    (contentOffsetY: number, contentHeight: number, layoutHeight: number) => {
      syncScrollAwayFromBottom(contentOffsetY, contentHeight, layoutHeight);
      const nearOlderEdge = searching
        ? contentOffsetY < 140
        : contentOffsetY + layoutHeight >= contentHeight - 140;
      if (
        nearOlderEdge
        && hasMoreOlderRef.current
        && !searching
        && Date.now() - lastOlderLoadAtRef.current > 700
      ) {
        lastOlderLoadAtRef.current = Date.now();
        void tryLoadOlderMessages();
      }
    },
    [syncScrollAwayFromBottom, tryLoadOlderMessages, searching],
  );
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    cancelAllScrollPins();
    pendingScrollToEndRef.current = true;
    openChatPinDoneRef.current = false;
    userScrolledUpRef.current = false;
    applyReadingHistoryMode(false);
    lastNearBottomRef.current = true;
    setShowJumpToLatest((p) => (p ? false : p));
    setUnreadBelowCount((p) => (p > 0 ? 0 : p));
    frozenMessageCountRef.current = 0;
    hasMoreOlderRef.current = true;
    prevMessageCountRef.current = 0;
    hadRemoteTypingRef.current = false;
    return () => cancelAllScrollPins();
  }, [chatId, cancelAllScrollPins, applyReadingHistoryMode]);

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      frozenMessageCountRef.current = messages.length;
      setUnreadBelowCount((prev) => (prev > 0 ? 0 : prev));
      return;
    }
    const unread = Math.max(0, messages.length - frozenMessageCountRef.current);
    setUnreadBelowCount((prev) => (prev !== unread ? unread : prev));
    if (unread > 0) setShowJumpToLatest(true);
  }, [messages.length]);

  const composerLinkUrl = useMemo(() => {
    if (editTarget || selectionActive) return null;
    const url = primaryUrlFromText(text);
    if (!url || url === dismissedComposerLink) return null;
    return url;
  }, [text, editTarget, selectionActive, dismissedComposerLink]);

  const onKeyboardAnimStart = useCallback(() => {
    keyboardAnimatingRef.current = true;
  }, []);
  const onKeyboardAnimEnd = useCallback(() => {
    keyboardAnimatingRef.current = false;
  }, []);

  /** WhatsApp: track keyboard animation without forcing scroll (composer uses KeyboardStickyView). */
  useGenericKeyboardHandler(
    {
      onStart: () => {
        "worklet";
        runOnJS(onKeyboardAnimStart)();
      },
      onEnd: () => {
        "worklet";
        runOnJS(onKeyboardAnimEnd)();
      },
    },
    [onKeyboardAnimStart, onKeyboardAnimEnd],
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;
    KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING);
    return () => {
      KeyboardController.setDefaultMode();
    };
  }, []);

  const { keyboardVisible, keyboardHeight } = useChatKeyboard();
  const { width: screenWidth, height: windowHeight } = useWindowDimensions();
  const bubbleMaxWidth = screenWidth * 0.82;
  const prevKeyboardVisibleRef = useRef(false);
  const prevWindowHeightRef = useRef(windowHeight);
  const emojiPanelOpenRef = useRef(false);
  useEffect(() => {
    emojiPanelOpenRef.current = emojiPanelOpen;
  }, [emojiPanelOpen]);

  useEffect(() => {
    keyboardVisibleRef.current = keyboardVisible;
    if (!keyboardVisible) keyboardAnimatingRef.current = false;
  }, [keyboardVisible]);

  /** WhatsApp: keyboard opens at bottom → one quiet pin so latest stays above keyboard. */
  useEffect(() => {
    if (searching) return;
    const justOpened = keyboardVisible && !prevKeyboardVisibleRef.current;
    prevKeyboardVisibleRef.current = keyboardVisible;
    if (
      justOpened
      && !blocksAutoScroll()
      && lastNearBottomRef.current
      && !userDraggingRef.current
      && !emojiPanelOpenRef.current
    ) {
      pinToLatest(false, { source: "keyboard-open" });
    }
  }, [keyboardVisible, searching, pinToLatest, blocksAutoScroll]);

  /** Emoji panel replaces keyboard — keep latest visible above panel. */
  useEffect(() => {
    if (searching || !emojiPanelOpen) return;
    if (blocksAutoScroll() || userDraggingRef.current) return;
    if (!lastNearBottomRef.current) return;
    pinToLatest(false, { source: "emoji-panel" });
  }, [emojiPanelOpen, searching, pinToLatest, blocksAutoScroll]);

  /** After rotation, re-pin quietly when following the tail. */
  useEffect(() => {
    if (searching || blocksAutoScroll()) {
      prevWindowHeightRef.current = windowHeight;
      return;
    }
    if (Math.abs(windowHeight - prevWindowHeightRef.current) > 48 && lastNearBottomRef.current) {
      pinToLatest(false, { source: "rotation" });
    }
    prevWindowHeightRef.current = windowHeight;
  }, [windowHeight, searching, pinToLatest, blocksAutoScroll]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (keyboardVisibleRef.current) {
        Keyboard.dismiss();
        return true;
      }
      if (emojiPanelOpenRef.current) {
        setEmojiPanelOpen(false);
        return true;
      }
      if (selectionActive) {
        clearSelection();
        return true;
      }
      if (searching) {
        setSearching(false);
        setSearchQuery("");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [selectionActive, searching, clearSelection]);

  useEffect(() => {
    messagesReadyRef.current = messagesReady;
    messagesLenRef.current = messages.length;
  });

  useEffect(() => {
    if (searching || !messagesReady) return;
    if (pendingScrollToEndRef.current) {
      if (messages.length === 0) {
        pendingScrollToEndRef.current = false;
        return;
      }
      pendingScrollToEndRef.current = false;
      if (!blocksAutoScroll()) {
        scheduleOpenChatPin();
      }
      prevMessageCountRef.current = messages.length;
      return;
    }
    const count = messages.length;
    if (count > prevMessageCountRef.current && !blocksAutoScroll() && !userDraggingRef.current) {
      const delta = count - prevMessageCountRef.current;
      scrollToLatestIfFollowing(
        shouldAnimateChatPin(delta, keyboardAnimatingRef.current),
        "messages-delta",
      );
    }
    prevMessageCountRef.current = count;
  }, [messages.length, messagesReady, searching, scrollToLatestIfFollowing, scheduleOpenChatPin, blocksAutoScroll]);

  /** Inverted list: reserve space above sticky composer + keyboard/emoji at visual bottom. */
  const listVisualBottomPad = useMemo(() => {
    if (searching) return 8;
    const kbInset = keyboardVisible ? Math.max(0, keyboardHeight) : 0;
    const emojiInset =
      emojiPanelOpen && !selectionActive && voiceRecPhase === "idle" && !keyboardVisible
        ? CHAT_EMOJI_PANEL_HEIGHT
        : 0;
    return Math.max(10, composerHeight + kbInset + emojiInset + 8);
  }, [searching, composerHeight, keyboardVisible, keyboardHeight, emojiPanelOpen, selectionActive, voiceRecPhase]);
  const listTopPadding = 12;
  const jumpFabBottom = useMemo(
    () => {
      const kbInset = keyboardVisible ? keyboardHeight : 0;
      const emojiInset =
        emojiPanelOpen && !selectionActive && voiceRecPhase === "idle" && !keyboardVisible
          ? CHAT_EMOJI_PANEL_HEIGHT
          : 0;
      return Math.max(12, composerHeight + kbInset + emojiInset + 16);
    },
    [composerHeight, keyboardVisible, keyboardHeight, emojiPanelOpen, selectionActive, voiceRecPhase],
  );
  const onComposerLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      const h = Math.ceil(e.nativeEvent.layout.height);
      if (h > 0 && h !== composerHeight) setComposerHeight(h);
    },
    [composerHeight],
  );

  useEffect(() => {
    return () => {
      cancelAllScrollPins();
    };
  }, [cancelAllScrollPins]);

  /** Composer grew (reply / link preview) — pin only while user is following the tail. */
  useEffect(() => {
    if (blocksAutoScroll() || searching || userDraggingRef.current) return;
    if (!lastNearBottomRef.current) return;
    if (composerPinTimerRef.current) clearTimeout(composerPinTimerRef.current);
    composerPinTimerRef.current = setTimeout(
      () => scrollToLatestIfFollowing(false, "composer-height"),
      120,
    );
    return () => {
      if (composerPinTimerRef.current) clearTimeout(composerPinTimerRef.current);
    };
  }, [composerHeight, searching, scrollToLatestIfFollowing, blocksAutoScroll]);

  useEffect(() => {
    if (searching) return;
    const hasTyping = remoteTypingNames.length > 0;
    if (hasTyping && !hadRemoteTypingRef.current && !blocksAutoScroll()) {
      scrollToLatestIfFollowing(true, "typing-indicator");
    }
    hadRemoteTypingRef.current = hasTyping;
  }, [remoteTypingNames.length, searching, scrollToLatestIfFollowing, blocksAutoScroll]);

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

  const insertEmoji = useCallback((emoji: string) => {
    const current = editTarget ? editText : text;
    const start = textSelection.start;
    const end = textSelection.end;
    const next = current.slice(0, start) + emoji + current.slice(end);
    const pos = start + emoji.length;
    if (editTarget) setEditText(next);
    else setText(next);
    setTextSelection({ start: pos, end: pos });
    requestAnimationFrame(() => {
      inputRef.current?.setNativeProps?.({ selection: { start: pos, end: pos } });
    });
  }, [editTarget, editText, text, textSelection]);

  const toggleEmojiPanel = useCallback(() => {
    if (!composerEnabled || editTarget) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEmojiPanelOpen((open) => {
      if (!open) Keyboard.dismiss();
      return !open;
    });
  }, [composerEnabled, editTarget]);

  const sendGifOrSticker = useCallback(async (item: GifMediaItem, kind: "gif" | "sticker") => {
    if (!chatId || !composerEnabled || editTarget) return;
    setEmojiPanelOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const mediaUrl = await uploadRemoteGifOrSticker(item, user?.sessionToken, kind);
      sendPreparedMediaMessage(chatId, { mediaUrl, kind: "image" });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : kind === "gif" ? "Could not send GIF." : "Could not send sticker.");
    }
  }, [chatId, composerEnabled, editTarget, user?.sessionToken, sendPreparedMediaMessage]);

  const handlePickGif = useCallback((item: GifMediaItem) => {
    void sendGifOrSticker(item, "gif");
  }, [sendGifOrSticker]);

  const handlePickSticker = useCallback((item: GifMediaItem) => {
    void sendGifOrSticker(item, "sticker");
  }, [sendGifOrSticker]);

  const handleTextChange = useCallback((val: string) => {
    if (dismissedComposerLink && !val.includes(dismissedComposerLink)) {
      setDismissedComposerLink(null);
    }
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
    sendMessage(
      chatId,
      text.trim(),
      replyTo?.id,
      replyTo
        ? {
            replyText: replyTo.text,
            replySenderName:
              replyTo.senderName ?? (replyTo.senderId === "me" ? user?.name : (name ?? chat?.name ?? "Chat")),
            replyQuotedSenderId: replyTo.senderId === "me" ? String(user?.dbId ?? "") : replyTo.senderId,
            replyType: replyTo.type,
          }
        : undefined,
    );
    setText("");
    setReplyTo(null);
  }, [text, chatId, sendMessage, replyTo, clearTyping, editTarget, editText, editMessage, composerEnabled, chat?.isGroup, groupSendPermission?.policy, user?.dbId, user?.name, name, chat?.name]);

  const sendMediaMessage = async (
    type: "camera" | "videocamera" | "gallery" | "document" | "location" | "contact" | "viewonce" | "audiofile",
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
      const result = await launchChatPhotoCamera();
      if (result && !result.canceled && result.assets[0]) {
        const picked = await validatePickedMedia(result.assets[0]);
        if (picked) goToMediaCompose(picked, false);
      }

    } else if (type === "videocamera") {
      const result = await launchChatVideoCamera();
      if (result && !result.canceled && result.assets[0]) {
        const picked = await validatePickedMedia(result.assets[0]);
        if (picked) goToMediaCompose(picked, false);
      }

    } else if (type === "gallery" || type === "viewonce") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission required", "Media library access is required."); return; }
      const pickerOpts = isViewOnce ? CHAT_VIEW_ONCE_PICKER_OPTIONS : CHAT_VIDEO_PICKER_OPTIONS;
      const result = await ImagePicker.launchImageLibraryAsync(pickerOpts);
      if (result.canceled || !result.assets?.length) return;
      const picked = await validatePickedAssets(result.assets);
      if (picked.length === 0) return;
      const videos = picked.filter((p) => p.kind === "video");
      const images = picked.filter((p) => p.kind === "image");
      if (videos.length > 0 && picked.length > 1) {
        Alert.alert("One video at a time", "Select a single video, or choose photos only.");
        return;
      }
      if (videos.length === 1) {
        goToMediaCompose(videos[0], isViewOnce);
        return;
      }
      if (images.length === 1) {
        goToMediaCompose(images[0], isViewOnce);
        return;
      }
      void goToMediaComposeBatch(images, isViewOnce);

    } else if (type === "audiofile") {
      setAttachVisible(false);
      if (Platform.OS === "web") {
        const picked = await pickWebFile("audio/*,.mp3,.m4a,.wav,.aac,.ogg,.webm");
        if (!picked) return;
        try {
          const upload = await uploadChatMediaWithProgress({
            uri: picked.uri,
            mime: picked.mime,
            filename: picked.name,
            sessionToken: user?.sessionToken,
          });
          sendSpecialMessage(chatId, picked.name, "audio", upload.url);
        } catch (e) {
          Alert.alert("Error", e instanceof Error ? e.message : "Could not send this audio file.");
        }
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/*", "audio/mpeg", "audio/mp4", "audio/mp3", "audio/wav", "audio/x-wav", "audio/aac"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      try {
        const mimeType = asset.mimeType ?? guessMimeFromFilename(asset.name ?? "audio.m4a", "audio/mp4");
        const upload = await uploadChatMediaWithProgress({
          uri: asset.uri,
          mime: mimeType,
          filename: asset.name || `audio_${Date.now()}.m4a`,
          sessionToken: user?.sessionToken,
        });
        sendSpecialMessage(chatId, asset.name ?? "Audio", "audio", upload.url);
      } catch (e) {
        Alert.alert("Error", e instanceof Error ? e.message : "Could not send this audio file.");
      }

    } else if (type === "document") {
      setAttachVisible(false);
      if (Platform.OS === "web") {
        const picked = await pickWebFile("*/*");
        if (!picked) return;
        const fileSizeMB = picked.size / 1024 / 1024;
        if (fileSizeMB > 100) {
          Alert.alert("File too large", "Maximum allowed file size is 100 MB.");
          return;
        }
        goToDocumentCompose({ uri: picked.uri, name: picked.name, size: picked.size, mime: picked.mime });
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const fileSizeMB = (asset.size ?? 0) / 1024 / 1024;
      if (fileSizeMB > 100) { Alert.alert("File too large", "Maximum allowed file size is 100 MB."); return; }
      const filename = asset.name ?? `document_${Date.now()}`;
      const mimeType = asset.mimeType ?? guessMimeFromFilename(filename);
      goToDocumentCompose({ uri: asset.uri, name: filename, size: asset.size ?? 0, mime: mimeType });

    } else if (type === "location") {
      if (!chatId) return;
      router.push({ pathname: "/chat/send-location", params: { id: chatId } } as unknown as Href);

    } else if (type === "contact") {
      setAttachVisible(false);
      setContactToConfirm(null);
      setContactPickerOpen(true);
    }
  };

  const showCameraOptions = useCallback(() => {
    if (!composerEnabled || editTarget || !chatId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEmojiPanelOpen(false);
    if (Platform.OS === "web") {
      void sendMediaMessage("camera");
      return;
    }
    setCameraSheetOpen(true);
  }, [composerEnabled, editTarget, chatId, sendMediaMessage]);

  const runCameraChoice = useCallback((kind: "camera" | "videocamera") => {
    setCameraSheetOpen(false);
    void sendMediaMessage(kind);
  }, [sendMediaMessage]);

  const sendSpecialMessage = useCallback((cid: string, text: string, msgType: string, mediaUrl?: string) => {
    const u = user;
    if (u?.dbId) {
      void (async () => {
        try {
          const res = await fetch(`${BASE_URL}/api/chats/${cid}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(u.sessionToken ? { Authorization: `Bearer ${u.sessionToken}` } : {}),
            },
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

  const openContactPickerRow = useCallback((row: ContactShareRow) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setContactPickerOpen(false);
    setContactToConfirm({
      ...row,
      phones: dedupePhones(row.phones),
      emails: dedupeEmails(row.emails),
    });
  }, []);

  const confirmShareContact = useCallback(() => {
    if (!chatId || !contactToConfirm) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sendContactMessage(chatId, {
      name: contactToConfirm.name,
      phones: dedupePhones(contactToConfirm.phones),
      emails: dedupeEmails(contactToConfirm.emails),
    });
    setContactToConfirm(null);
  }, [chatId, contactToConfirm, sendContactMessage]);

  const saveSharedContactToPhone = useCallback(async (text: string) => {
    const parsed = parseContactMessage(text);
    if (!parsed) return;
    if (Platform.OS === "web") {
      const { downloadContactVCardFromMessage } = await import("@/lib/web/webVCard");
      const res = downloadContactVCardFromMessage(text);
      Alert.alert(res.ok ? "Downloaded" : "Error", res.ok ? "Contact saved as .vcf file." : res.message);
      return;
    }
    const primaryPhone = parsed.phones[0];
    if (!primaryPhone) {
      Alert.alert("Error", "No phone number found in this contact.");
      return;
    }
    const { addDeviceContact } = await import("@/lib/deviceContacts");
    const result = await addDeviceContact({ name: parsed.name, phone: primaryPhone });
    if (result.ok) {
      Alert.alert("Saved", `${parsed.name} was added to your contacts.`);
      return;
    }
    if (result.reason === "cancelled") return;
    Alert.alert(
      result.reason === "permission" ? "Permission required" : "Error",
      result.message,
    );
  }, []);

  const handleStopLiveLocation = useCallback(async (msg: Message) => {
    if (!chatId) return;
    const p = parseLocationPayload(msg.text);
    if (!p || p.mode !== "live") return;
    const next = encodeLocationPayload({ ...p, stopped: true });
    await updateLocationOnServer(chatId, msg.id, { content: next, mediaUrl: mapsUrl(p.lat, p.lng) });
    stopLiveLocationSession();
  }, [chatId, updateLocationOnServer, stopLiveLocationSession]);

  const handleDocumentPress = useCallback((item: Message) => {
    if (!chatId || !item.mediaUrl) return;
    if (item.uploadFailed) {
      deleteMessage(chatId, item.id);
      const parsed = parseDocumentMessagePayload(item.text);
      const mime = guessMimeFromFilename(parsed.filename);
      sendDocumentMessage(
        chatId,
        item.localMediaUri ?? item.mediaUrl,
        parsed.filename,
        item.fileSizeBytes ?? 0,
        mime,
        { caption: parsed.caption, pageCount: parsed.pages },
      );
      return;
    }
    if (typeof item.uploadProgress === "number" && item.uploadProgress < 100) return;
    if (typeof item.downloadProgress === "number" && item.downloadProgress < 100) return;

    void (async () => {
      try {
        const hasLocal = Boolean(item.localMediaUri?.trim());
        if (!hasLocal) {
          patchChatMessage(chatId, item.id, { downloadProgress: 0 });
        }
        const result = await openChatDocument({
          mediaUrl: item.mediaUrl!,
          filename: documentFilenameFromText(item.text),
          sessionToken: user?.sessionToken,
          localUri: item.localMediaUri,
          expectedSizeBytes: item.fileSizeBytes,
          onDownloadProgress: (pct) => {
            patchChatMessage(chatId, item.id, { downloadProgress: pct });
          },
        });
        patchChatMessage(chatId, item.id, {
          localMediaUri: result.localUri,
          fileSizeBytes: result.sizeBytes ?? item.fileSizeBytes,
          downloadProgress: undefined,
        });
      } catch (e) {
        patchChatMessage(chatId, item.id, { downloadProgress: undefined });
        Alert.alert("Error", e instanceof Error ? e.message : "Could not open this document on your device.");
      }
    })();
  }, [chatId, deleteMessage, sendDocumentMessage, user?.sessionToken, patchChatMessage]);

  const handleDocumentSaveAs = useCallback((item: Message) => {
    if (!item.mediaUrl) return;
    void (async () => {
      const url = resolvePublicAssetUrl(item.mediaUrl) ?? item.mediaUrl;
      if (!url) return;
      const headers = authFetchHeaders(user?.sessionToken);
      const res = await downloadUrlToDevice(url, item.text || "document", headers);
      if (!res.ok) Alert.alert("Download failed", res.message);
    })();
  }, [user?.sessionToken]);

  const saveImageToGallery = useCallback(async (uri: string) => {
    const allowGallery = await loadMediaVisibilityEnabled();
    if (!allowGallery) {
      Alert.alert(
        "Media visibility is off",
        "Turn on Media visibility in Settings → Chats to save photos to your phone gallery.",
      );
      return;
    }
    const res = await saveImageUriToLibrary(uri, user?.sessionToken);
    if (res.ok) {
      Alert.alert("Saved", Platform.OS === "web" ? "Image downloaded." : "Image saved to your gallery.");
    } else {
      Alert.alert("Error", res.message);
    }
  }, [user?.sessionToken]);

  const [attachVisible, setAttachVisible] = useState(false);

  const handleAttachGalleryPicks = useCallback(async (items: GalleryAsset[]) => {
    setAttachVisible(false);
    if (items.length === 0) return;
    const picked = await validateGalleryAssets(items);
    if (picked.length === 0) return;
    const videos = picked.filter((p) => p.kind === "video");
    const images = picked.filter((p) => p.kind === "image");
    if (videos.length > 0 && picked.length > 1) {
      Alert.alert("One video at a time", "Select a single video, or choose photos only.");
      return;
    }
    if (videos.length === 1) {
      goToMediaCompose(videos[0], false);
      return;
    }
    if (images.length === 1) {
      goToMediaCompose(images[0], false);
      return;
    }
    void goToMediaComposeBatch(images, false);
  }, [goToMediaCompose, goToMediaComposeBatch]);

  useWebKeyboardShortcuts({
    enabled: Platform.OS === "web" && !selectionActive && !attachVisible,
    onSend: () => handleSend(),
    onSearch: () => {
      setSearching(true);
      setSearchQuery("");
    },
    onEscape: () => {
      if (attachVisible) setAttachVisible(false);
      else if (searching) {
        setSearching(false);
        setSearchQuery("");
      } else if (emojiPanelOpen) setEmojiPanelOpen(false);
      else if (replyTo) setReplyTo(null);
      else if (editTarget) {
        setEditTarget(null);
        setEditText("");
      }
    },
  });

  const [cameraSheetOpen, setCameraSheetOpen] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<{ uri: string; caption?: string; type: "image" | "video" } | null>(null);
  const [albumGallery, setAlbumGallery] = useState<{
    urls: string[];
    index: number;
    caption?: string;
  } | null>(null);
  const showAttachMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAttachVisible(true);
  };

  const showMessageContextMenu = (msg: Message) => {
    if (msg.type === "deleted") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const isMe = msg.senderId === "me";

    const opts: any[] = [
      { text: "Reply", onPress: () => { setReplyTo(toReplyData(msg, messageFallback)); inputRef.current?.focus(); } },
      { text: "Copy", onPress: () => { Clipboard.setString(msg.text); } },
      { text: "React", onPress: () => { setSelectedIds([msg.id]); setReactionTarget(msg); } },
      ...(msg.type === "image" && msg.mediaUrl && !msg.isViewOnce
        ? [{
            text: Platform.OS === "web" ? "Download image" : "Save image",
            onPress: () => { void saveImageToGallery(msg.mediaUrl!); },
          }]
        : []),
      ...(!msg.isViewOnce ? [{ text: "Forward", onPress: () => { setForwardSearch(""); setForwardIds([msg.id]); } }] : []),
      { text: "Star", onPress: () => { if (chatId) starMessage(chatId, msg.id); } },
      ...(disappearingOn && msg.expiresAt && !msg.isKept && msg.type !== "system"
        ? [{
            text: "Keep",
            onPress: () => {
              if (!chatId) return;
              void keepMessage(chatId, msg.id).catch(() => {
                Alert.alert("Keep message", "Could not keep this message. Try again.");
              });
            },
          }]
        : []),
      { text: "Translate", onPress: () => Alert.alert("Translate to:", "", [
          { text: "à¤¹à¤¿à¤‚à¤¦à¥€ (Hindi)", onPress: () => translateMsg(msg, "hi") },
          { text: "English", onPress: () => translateMsg(msg, "en") },
          { text: "à¦¬à¦¾à¦‚à¦²à¦¾ (Bengali)", onPress: () => translateMsg(msg, "bn") },
          { text: "à®¤à®®à®¿à®´à¯ (Tamil)", onPress: () => translateMsg(msg, "ta") },
          { text: "à°¤à±†à°²à±à°—à± (Telugu)", onPress: () => translateMsg(msg, "te") },
          { text: "à¤®à¤°à¤¾à¤ à¥€ (Marathi)", onPress: () => translateMsg(msg, "mr") },
          { text: "Cancel", style: "cancel" },
        ]) },
    ];
    if (isMe) {
      opts.push({ text: "Info", onPress: () => router.push({ pathname: "/chat/message-info", params: { chatId: chatId!, messageId: msg.id } }) });
      opts.push({ text: "Edit", onPress: () => { setEditTarget(msg); setEditText(msg.text); inputRef.current?.focus(); } });
    }
    opts.push({
      text: "Delete",
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

  const openDisappearSettings = useCallback(() => {
    if (!chatId) return;
    router.push({
      pathname: "/disappearing-messages/[id]",
      params: { id: chatId },
    });
  }, [chatId, router]);

  const renderMsg = ({ item }: { item: Message }) => {
    if (item.type === "system") {
      return (
        <ChatSystemMessageBubble
          text={item.text}
          isDark={colors.isDark}
          viewerUserId={user?.dbId}
          onChangeTimer={openDisappearSettings}
        />
      );
    }

    const isMe = item.senderId === "me";
    const isDeleted = item.type === "deleted";
    const isViewOnceOpened = (item.type === "image" || item.type === "video") && item.isViewOnce && (item.viewOnceOpened || !item.mediaUrl);
    const isViewOncePending = (item.type === "image" || item.type === "video") && item.isViewOnce && !!item.mediaUrl && !item.viewOnceOpened && !isMe;
    const albumUrls = displayAlbumUrls({
      albumUrls: resolveAlbumUrls(item.text, {
        albumUrls: item.albumUrls,
        mediaUrl: item.mediaUrl,
      }),
      albumLocalUrls: item.albumLocalUrls,
      uploadProgress: item.uploadProgress,
      uploadFailed: item.uploadFailed,
      id: item.id,
    });
    const isAlbum = isAlbumMessage(item.type, item.text, {
      albumUrls: item.albumUrls ?? item.albumLocalUrls,
      mediaUrl: item.mediaUrl,
    }) && albumUrls.length >= 2;
    const displayMediaUri = item.localMediaUri ?? item.mediaUrl ?? "";
    const isImage = !isAlbum && item.type === "image" && !!displayMediaUri && !isViewOncePending;
    const isVideo = item.type === "video" && !!displayMediaUri && !isViewOncePending;
    const mediaUploading = isMe
      && (isImage || isVideo || isAlbum)
      && typeof item.uploadProgress === "number"
      && item.uploadProgress < 100
      && !item.uploadFailed;
    const mediaUploadFailed = isMe && (isImage || isVideo || isAlbum) && item.uploadFailed === true;
    const mediaUploadPct = item.uploadProgress ?? 0;
    const isAudio = item.type === "audio" && !!item.mediaUrl;
    const effectiveType = normalizeMessageType(item.type, item.text, item.mediaUrl);
    const isDocument = effectiveType === "document";
    const isLocation = effectiveType === "location";
    const isContact = effectiveType === "contact";
    const isCall = effectiveType === "call";
    const callMeta = isCall ? parseCallMessageMeta(item.text) : null;
    const isSpecial = isDocument || isLocation || isContact || isCall;
    const urls = (!isDeleted && !isImage && !isAudio && !isSpecial) ? extractUrls(item.text) : [];
    const isManyForwarded = (item.forwardCount ?? 0) >= 5;
    const metaTextColor = isImage || isAlbum || isLocation
      ? "rgba(255,255,255,0.92)"
      : isMe
        ? "rgba(0,0,0,0.55)"
        : colors.mutedForeground;

    const showSvgTail = !isImage && !isVideo && !isAlbum && !isLocation && !isViewOnceOpened && !isViewOncePending;
    const isPlainText =
      !isDeleted
      && !isAlbum
      && !isImage
      && !isVideo
      && !isAudio
      && !isDocument
      && !isLocation
      && !isContact
      && !isCall
      && !isViewOnceOpened
      && !isViewOncePending;
    const compactTextBubble =
      isPlainText
      && !item.replyToId
      && !translatedMsgs[item.id]
      && urls.length === 0
      && isCompactChatText(item.text);

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

    const isSelected = selectedIdSet.has(item.id);
    const isFlashing = flashMessageId === item.id;
    const flashTint = flashAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["rgba(255, 193, 7, 0)", "rgba(255, 193, 7, 0.38)"],
    });
    const quoteAccent = colors.primary;
    const readMoreLinkColor = isMe
      ? colors.isDark
        ? "#53BDEB"
        : "#027EB5"
      : colors.primary;
    const selectionRowTint = colors.isDark ? "rgba(0, 168, 132, 0.2)" : "rgba(183, 223, 165, 0.55)";
    const deletedMeLabel = colors.isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.52)";
    const deletedMeIcon = colors.isDark ? "rgba(255,255,255,0.58)" : "rgba(0,0,0,0.42)";
    const deletedMeTime = colors.isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.42)";
    const msgRow = (
      <View style={[styles.msgRowOuter, isSelected && styles.msgRowOuterBleed]}>
        {isFlashing ? (
          <Animated.View
            style={[StyleSheet.absoluteFillObject, { backgroundColor: flashTint, borderRadius: 8 }]}
            pointerEvents="none"
          />
        ) : null}
        {isSelected ? (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: selectionRowTint }]} pointerEvents="none" />
        ) : null}
        <Pressable
          onPress={() => {
            if (selectedIds.length > 0 && !isDeleted) {
              setSelectedIds((prev) => {
                const next = prev.includes(item.id)
                  ? prev.filter((x) => x !== item.id)
                  : [...prev, item.id];
                if (next.length !== 1) setReactionTarget(null);
                return next;
              });
            }
          }}
          onLongPress={() => {
            if (isDeleted) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSelectedIds((prev) => {
              if (prev.length === 0) {
                setReactionTarget(item);
                return [item.id];
              }
              const next = prev.includes(item.id)
                ? prev.filter((x) => x !== item.id)
                : [...prev, item.id];
              setReactionTarget(next.length === 1 ? item : null);
              return next;
            });
          }}
          delayLongPress={400}
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

        <View style={[styles.bubbleTailWrap, { maxWidth: bubbleMaxWidth }]}>
          <View
            style={[
              styles.bubble,
              showSvgTail && styles.bubbleWithTailShape,
              { backgroundColor: isMe ? colors.chatBubbleSent : colors.chatBubbleReceived },
              (isImage || isVideo || isAlbum || isLocation || isViewOnceOpened || isViewOncePending) && styles.bubbleImg,
              isDeleted && styles.bubbleDeleted,
              compactTextBubble && styles.bubbleCompact,
            ]}
          >
          {/* Reply strip */}
          {item.replyToId && item.replyText && !isDeleted && (
            <ReplyQuoteStrip
              senderLabel={replyQuoteSenderLabel({
                replyQuotedSenderId: item.replyQuotedSenderId,
                replySenderName: item.replySenderName,
                viewerDbId: user?.dbId,
                chatContactName,
                isGroup: chat?.isGroup,
              })}
              previewText={item.replyText?.trim() || messageFallback}
              isMe={isMe}
              accentColor={quoteAccent}
              previewColor={REPLY_PREVIEW_TEXT_COLOR}
              contactFallback={t("common.contact")}
              messageFallback={messageFallback}
              onPress={() => scrollToQuotedMessage(item.replyToId!)}
            />
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
                {isMe ? "Deleted for everyone" : "This message was deleted"}
              </Text>
              <Text style={[styles.deletedTimeWa, { color: isMe ? deletedMeTime : colors.mutedForeground }]}>
                {formatChatBubbleTime(item.timestamp)}
              </Text>
            </View>
          ) : isViewOnceOpened ? (
            <ViewOnceOpenedBubble kind={item.type === "video" ? "video" : "image"} />
          ) : isViewOncePending ? (
            <ViewOncePlaceholderBubble
              kind={item.type === "video" ? "video" : "image"}
              onOpen={() => { void openViewOnceMedia(item); }}
            />
          ) : isAlbum && albumUrls ? (
            <>
              <View style={styles.mediaBubbleWrap}>
                <ChatAlbumBubble
                  urls={albumUrls}
                  width={W * 0.62}
                  sessionToken={user?.sessionToken}
                  onOpenImage={(_uri, index) => {
                    const cap = item.text?.trim();
                    const defaultLabel = `${albumUrls.length} photos`;
                    setAlbumGallery({
                      urls: albumUrls,
                      index,
                      caption: cap && cap !== defaultLabel && cap !== "Photo" ? cap : undefined,
                    });
                  }}
                />
                <MediaUploadOverlay
                  uploading={mediaUploading}
                  failed={mediaUploadFailed}
                  progress={mediaUploadPct}
                />
              </View>
              {(() => {
                const cap = item.text?.trim();
                const defaultLabel = `${albumUrls.length} photos`;
                if (!cap || cap === defaultLabel || cap === "Photo") return null;
                return (
                  <Text style={[styles.msgText, { color: colors.foreground, paddingHorizontal: 8, paddingTop: 4, fontSize: 15 * chatFontScale, lineHeight: 21 * chatFontScale }]}>{cap}</Text>
                );
              })()}
            </>
          ) : isImage && displayMediaUri ? (
            <>
              <View style={styles.mediaBubbleWrap}>
                <ChatImageBubble
                  uri={displayMediaUri}
                  sessionToken={user?.sessionToken}
                  onOpen={() => {
                    if (mediaUploading) return;
                    if (item.isViewOnce) {
                      void openViewOnceMedia(item);
                      return;
                    }
                    setMediaPreview({
                      uri: displayMediaUri,
                      type: "image",
                      caption: item.text && item.text !== "ðŸ“· Photo" && item.text !== "ðŸŽ¥ Video" && item.text !== "ðŸ” View once"
                        ? item.text
                        : undefined,
                    });
                  }}
                />
                <MediaUploadOverlay
                  uploading={mediaUploading}
                  failed={mediaUploadFailed}
                  progress={mediaUploadPct}
                />
              </View>
              {item.isViewOnce && (
                <View style={styles.viewOnceOverlay}>
                  <Ionicons name="eye-outline" size={18} color="#fff" />
                  <Text style={styles.viewOnceText}>View once</Text>
                </View>
              )}
              {displayMediaUri && isGifUri(displayMediaUri) && (
                <View style={[styles.viewOnceOverlay, { left: undefined, right: 8 }]}>
                  <Text style={styles.viewOnceText}>GIF</Text>
                </View>
              )}
              {item.text && item.text !== "ðŸ“· Photo" && item.text !== "ðŸŽ¥ Video" && item.text !== "ðŸ” View once" && (
                <Text style={[styles.msgText, { color: colors.foreground, paddingHorizontal: 8, paddingTop: 4, fontSize: 15 * chatFontScale, lineHeight: 21 * chatFontScale }]}>{item.text}</Text>
              )}
            </>
          ) : isVideo && displayMediaUri ? (
            <>
              <View style={styles.mediaBubbleWrap}>
                <ChatVideoThumbnailBubble
                  uri={displayMediaUri}
                  sessionToken={user?.sessionToken}
                  onOpen={() => {
                    if (mediaUploading) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (item.isViewOnce) {
                      void openViewOnceMedia(item);
                      return;
                    }
                    void openChatVideoFullScreen(displayMediaUri, isMe, item.timestamp);
                  }}
                />
                <MediaUploadOverlay
                  uploading={mediaUploading}
                  failed={mediaUploadFailed}
                  progress={mediaUploadPct}
                />
              </View>
              {item.isViewOnce && (
                <View style={styles.viewOnceOverlay}>
                  <Ionicons name="eye-outline" size={18} color="#fff" />
                  <Text style={styles.viewOnceText}>View once</Text>
                </View>
              )}
              {item.text && item.text !== "ðŸŽ¥ Video" && item.text !== "ðŸ” View once" && (
                <Text style={[styles.msgText, { color: colors.foreground, paddingHorizontal: 8, paddingTop: 4, fontSize: 15 * chatFontScale, lineHeight: 21 * chatFontScale }]}>{item.text}</Text>
              )}
            </>
          ) : isCall && callMeta ? (
            <CallMessageBubble
              meta={callMeta}
              isMe={isMe}
              colors={colors}
              onPress={() => {
                if (!chatId) return;
                router.push({
                  pathname: "/call/[id]",
                  params: { id: chatId, name: chat?.name ?? "Contact", type: callMeta.callType === "video" ? "video" : "audio" },
                });
              }}
            />
          ) : isAudio && item.mediaUrl ? (
            <VoiceNotePlayer
              uri={item.mediaUrl}
              colors={colors}
              isMe={isMe}
              messageId={item.id}
              messageText={item.text}
              durationHintSec={parseVoiceDurationSec(item.text)}
              avatarUri={isMe ? (user?.avatar ?? undefined) : (contactAvatar ?? undefined)}
              sessionToken={user?.sessionToken}
            />
          ) : isDocument ? (
            <DocumentMessageBubble
              item={item}
              isMe={isMe}
              colors={colors}
              sessionToken={user?.sessionToken}
              onPress={() => handleDocumentPress(item)}
              onCancelUpload={
                isMe && typeof item.uploadProgress === "number" && item.uploadProgress < 100
                  ? () => cancelDocumentUpload(chatId!, item.id)
                  : undefined
              }
              onSaveAs={Platform.OS === "web" ? () => handleDocumentSaveAs(item) : undefined}
            />
          ) : isLocation ? (
            <LocationMessageBubble
              item={item}
              colors={colors}
              isMe={isMe}
              chatId={chatId}
              userAvatar={isMe ? user?.avatar : contactAvatar}
              onStopLive={(m) => { void handleStopLiveLocation(m); }}
            />
          ) : isContact ? (
            <ContactMessageBubble
              text={item.text}
              colors={colors}
              isMe={isMe}
              onPress={() => setViewContactMsg(item)}
              onCall={(phone) => { Linking.openURL(`tel:${phone}`).catch(() => {}); }}
            />
          ) : compactTextBubble ? (
            <ChatCompactMessageText
              text={item.text}
              time={formatChatBubbleTime(item.timestamp)}
              isMe={isMe}
              status={item.status}
              isEdited={item.isEdited}
              timeColor={metaTextColor}
              linkColor={readMoreLinkColor}
              style={[
                styles.msgText,
                styles.msgTextCompact,
                { color: colors.foreground, fontSize: 15 * chatFontScale, lineHeight: 20 * chatFontScale },
              ]}
            />
          ) : (
            <>
              <ChatMessageText
                text={item.text}
                linkColor={readMoreLinkColor}
                style={[styles.msgText, { color: colors.foreground, fontSize: 15 * chatFontScale, lineHeight: 21 * chatFontScale }]}
              />
              {urls.length > 0 && (
                <TouchableOpacity onPress={() => Linking.openURL(urls[0])} style={styles.linkPreview}>
                  <Ionicons name="link-outline" size={13} color={colors.primary} />
                  <Text style={[styles.linkText, { color: colors.primary }]} numberOfLines={1}>{urls[0]}</Text>
                </TouchableOpacity>
              )}
              {translatedMsgs[item.id] && (
                <View style={styles.translatedBox}>
                  <Text style={styles.translatedLabel}>Translated</Text>
                  <Text style={[styles.msgText, { color: colors.foreground, fontSize: 15 * chatFontScale, lineHeight: 21 * chatFontScale }]}>{translatedMsgs[item.id]}</Text>
                </View>
              )}
            </>
          )}

          {/* Footer: time + edited + ticks (compact short text uses inline row above) */}
          {!isDeleted && !compactTextBubble ? (
            <View style={[styles.msgMeta, (isImage || isVideo || isAlbum || isLocation) && styles.msgMetaOnMedia, isCall && styles.msgMetaCall]}>
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
          setReplyTo(toReplyData(item, messageFallback));
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
  const contactAvatar = resolvePublicAssetUrl(chat?.avatar ?? otherAvatar);
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
        headers: {
          "Content-Type": "application/json",
          ...(user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
        },
        body: JSON.stringify({ userId: user.dbId, wallpaper: dataUri }),
      }).catch(() => {});
    }
  }, [chatId, user?.dbId]);

  const removeWallpaper = useCallback(() => {
    setWallpaper(null);
    if (chatId && user?.dbId) {
      fetch(`${BASE_URL}/api/chats/${chatId}/wallpaper`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
        },
        body: JSON.stringify({ userId: user.dbId, wallpaper: null }),
      }).catch(() => {});
    }
  }, [chatId, user?.dbId]);

  const directContactId = !chat?.isGroup ? chat?.otherUserId : undefined;
  const showBusinessIntro =
    !searching
    && !chat?.isGroup
    && !!businessChannelInfo
    && !blockState.iBlockedThem
    && !blockState.theyBlockedMe;
  const showUnsavedContactCard =
    !searching
    && !chat?.isGroup
    && !businessChannelInfo
    && !!peerContactPreview
    && !peerContactPreview.isSavedInDevice
    && !blockState.iBlockedThem
    && !blockState.theyBlockedMe;
  const showGroupWelcomeCard =
    !searching
    && !!chat?.isGroup
    && !groupWelcomeDismissed
    && !!groupWelcomePreview
    && groupWelcomePreview.createdByUserId !== user?.dbId;
  const hasIntroCards = showBusinessIntro || showUnsavedContactCard || showGroupWelcomeCard;
  const isChatEmpty = messagesReady && !searching && listRows.length === 0;
  const showEmptyStateLabel = isChatEmpty && !hasIntroCards;

  useFocusEffect(
    useCallback(() => {
      if (!chatId || !chat?.isGroup || !user?.dbId) {
        setGroupWelcomePreview(null);
        setGroupWelcomeDismissed(false);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const dismissed = await isGroupWelcomeDismissed(chatId);
          if (cancelled) return;
          setGroupWelcomeDismissed(dismissed);
          if (dismissed) {
            setGroupWelcomePreview(null);
            return;
          }

          const [detailsRes, membersRes] = await Promise.all([
            fetch(`${BASE_URL}/api/chats/${chatId}/details`),
            fetch(`${BASE_URL}/api/chats/${chatId}/members`),
          ]);
          const detailsData = await detailsRes.json();
          const membersData = await membersRes.json();
          const createdBy = Number(detailsData.chat?.created_by) || 0;
          const createdAtRaw = detailsData.chat?.created_at;
          const createdAtMs = createdAtRaw ? new Date(createdAtRaw).getTime() : Date.now();
          const members = (membersData.members ?? []) as Array<{ id: number; name?: string; phone?: string }>;
          if (!createdBy || createdBy === user.dbId || cancelled) {
            setGroupWelcomePreview(null);
            return;
          }
          const creator = members.find((m) => m.id === createdBy);
          if (!creator?.phone || cancelled) return;

          const { isPhoneInDeviceContacts } = await import("@/lib/deviceContacts");
          const creatorIsContact = await isPhoneInDeviceContacts(creator.phone);
          let contactsInGroupCount = 0;
          for (const m of members) {
            if (m.id === user.dbId || !m.phone) continue;
            if (await isPhoneInDeviceContacts(m.phone)) contactsInGroupCount += 1;
          }
          if (cancelled) return;

          setGroupWelcomePreview({
            addedByPhone: creator.phone,
            addedByName: creator.name,
            creatorIsContact,
            memberCount: members.length,
            contactsInGroupCount,
            createdAtMs,
            createdByUserId: createdBy || creator.id,
          });
        } catch {
          if (!cancelled) setGroupWelcomePreview(null);
        }
      })();
      return () => { cancelled = true; };
    }, [chatId, chat?.isGroup, user?.dbId]),
  );

  const handleStayInGroup = useCallback(() => {
    if (!chatId) return;
    void dismissGroupWelcome(chatId);
    setGroupWelcomeDismissed(true);
    setGroupWelcomePreview(null);
  }, [chatId]);

  const handleExitGroup = useCallback(() => {
    if (!chatId || !user?.dbId) return;
    Alert.alert("Exit group?", `You will no longer receive messages from ${displayName}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Exit group",
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${BASE_URL}/api/chats/${chatId}/members/${user.dbId}`, {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                ...(user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
              },
              body: JSON.stringify({ requesterId: user.dbId }),
            });
            void dismissGroupWelcome(chatId);
            router.replace("/(tabs)/chats");
          } catch {
            Alert.alert("Error", "Could not leave this group.");
          }
        },
      },
    ]);
  }, [chatId, displayName, router, user?.dbId, user?.sessionToken]);

  const handleReportGroup = useCallback(() => {
    Alert.alert("Report sent", "Thank you. We will review this group.");
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!chatId || chat?.isGroup || !directContactId) {
        setBusinessChannelInfo(null);
        return;
      }
      let cancelled = false;
      fetch(`${BASE_URL}/api/users/${directContactId}/business-channel`)
        .then((r) => r.json())
        .then((data: {
          success?: boolean;
          isBusiness?: boolean;
          displayName?: string;
          logoUrl?: string | null;
          joinedAt?: string | null;
        }) => {
          if (cancelled) return;
          if (data.success && data.isBusiness && data.displayName) {
            setBusinessChannelInfo({
              displayName: data.displayName,
              logoUrl: data.logoUrl ?? undefined,
              joinedAt: data.joinedAt,
            });
          } else {
            setBusinessChannelInfo(null);
          }
        })
        .catch(() => {
          if (!cancelled) setBusinessChannelInfo(null);
        });
      return () => { cancelled = true; };
    }, [chatId, chat?.isGroup, directContactId]),
  );

  const handleToggleBusinessMute = useCallback((wantMuted: boolean) => {
    if (!chatId) return;
    if (Boolean(chat?.isMuted) !== wantMuted) muteChat(chatId);
  }, [chat?.isMuted, chatId, muteChat]);

  useFocusEffect(
    useCallback(() => {
      if (!chatId || chat?.isGroup || !user?.dbId || !directContactId) {
        setPeerContactPreview(null);
        return;
      }
      let cancelled = false;
      (async () => {
        try {
          const [membersRes, statusRes] = await Promise.all([
            fetch(`${BASE_URL}/api/chats/${chatId}/members`),
            fetch(`${BASE_URL}/api/users/${user.dbId}/block-status?otherUserId=${directContactId}`),
          ]);
          const membersData = await membersRes.json();
          const statusData = await statusRes.json();
          const other = (membersData.members as Array<{ id: number; name?: string; phone?: string }> | undefined)
            ?.find((m) => m.id !== user.dbId);
          if (!other?.phone || cancelled) return;

          const { isPhoneInDeviceContacts } = await import("@/lib/deviceContacts");
          const isSavedInDevice = await isPhoneInDeviceContacts(other.phone);
          if (cancelled) return;

          setPeerContactPreview({
            phone: other.phone,
            profileName: other.name ?? displayName,
            isSavedInDevice,
            commonGroupCount: Number(statusData.common_group_count ?? 0),
          });
        } catch {
          if (!cancelled) setPeerContactPreview(null);
        }
      })();
      return () => { cancelled = true; };
    }, [chatId, chat?.isGroup, user?.dbId, directContactId, displayName]),
  );

  const handleAddUnsavedContact = useCallback(async () => {
    if (!peerContactPreview) return;
    const { addDeviceContact } = await import("@/lib/deviceContacts");
    const profileName = peerContactPreview.profileName.trim() || peerContactPreview.phone;
    const result = await addDeviceContact({
      name: profileName,
      phone: peerContactPreview.phone,
    });
    if (!result.ok) {
      if (result.reason === "cancelled") return;
      Alert.alert(
        result.reason === "permission" ? "Permission required" : "Error",
        result.message,
      );
      return;
    }
    const { syncDeviceContactsToServer } = await import("@/lib/syncContactsToServer");
    void syncDeviceContactsToServer(BASE_URL, user?.sessionToken);
    setPeerContactPreview((prev) => (prev ? { ...prev, isSavedInDevice: true } : null));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Saved", `${profileName} was added to your contacts.`);
  }, [peerContactPreview, user?.sessionToken]);

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

  const handleBlockBusiness = useCallback(() => {
    setManageBusinessOpen(false);
    handleMenuBlockToggle();
  }, [handleMenuBlockToggle]);

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
    { label: "Schedule message", icon: "time-outline", onPress: () => chatId && router.push({ pathname: "/scheduled/[chatId]", params: { chatId, name: displayName } }) },
    {
      label: "Khata",
      icon: "cash-outline",
      onPress: () => {
        if (!chatId) return;
        router.push({
          pathname: "/khata/[chatId]",
          params: {
            chatId,
            name: displayName,
            fromChat: "1",
            ...(chat?.isGroup ? { isGroup: "1" } : {}),
            ...(directContactId ? { peerUserId: String(directContactId) } : {}),
          },
        } as unknown as Parameters<typeof router.push>[0]);
      },
    },
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
  const bulkDeletableMessages = bulkSelectedMessages.filter((m) => m.type !== "deleted");
  const bulkMineMessages = bulkDeletableMessages.filter((m) => m.senderId === "me");
  const bulkOthersMessages = bulkDeletableMessages.filter((m) => m.senderId !== "me");
  const bulkAllMineDeletable =
    bulkDeletableMessages.length > 0 && bulkOthersMessages.length === 0;
  const bulkHasMine = bulkMineMessages.length > 0;
  const bulkHasOthers = bulkOthersMessages.length > 0;
  const bulkOthersCount = bulkOthersMessages.length;

  const handleBulkDeleteForMe = useCallback(() => {
    if (!chatId) return;
    for (const m of bulkDeletableMessages) {
      deleteMessage(chatId, m.id);
    }
    setBulkDeleteOpen(false);
    clearSelection();
  }, [bulkDeletableMessages, chatId, clearSelection, deleteMessage]);

  const handleBulkDeleteForEveryone = useCallback(() => {
    if (!chatId) return;
    for (const m of bulkMineMessages) {
      deleteForEveryone(chatId, m.id);
    }
    setBulkDeleteOpen(false);
    clearSelection();
  }, [bulkMineMessages, chatId, clearSelection, deleteForEveryone]);

  const inputVal = editTarget ? editText : text;

  // Filter members for mention autocomplete
  const mentionResults = mentionQuery !== null
    ? groupMembers.filter((m) => m.name.toLowerCase().startsWith(mentionQuery.toLowerCase()) && m.id !== user?.dbId)
    : [];
  const selectedMessage = selectedIds.length === 1 ? allMessages.find((m) => m.id === selectedIds[0]) : null;
  const canOpenMessageInfo = Boolean(chatId && selectedMessage && selectedMessage.senderId === "me" && selectedMessage.type !== "deleted");

  const openSelectedMessageInfo = () => {
    if (!chatId || !selectedMessage) return;
    clearSelection();
    router.push({ pathname: "/chat/message-info", params: { chatId, messageId: selectedMessage.id } });
  };

  const inputBarBottomPad = keyboardVisible
    ? Platform.OS === "ios"
      ? Math.max(insets.bottom, 8)
      : 8
    : Math.max(insets.bottom, Platform.OS === "web" ? 34 : 10);

  const composerFooter = (
    <>
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

      {!selectionActive && replyTo && !editTarget && (
        <View style={[styles.replyPreviewBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <Pressable
            style={[styles.replyPreview, { borderLeftColor: "#00A884" }]}
            onPress={() => scrollToQuotedMessage(replyTo.id)}
          >
            <View style={styles.replyPreviewTextCol}>
              <Text style={[styles.replyPreviewLabel, { color: "#00A884" }]} numberOfLines={1}>
                {replyQuoteSenderLabel({
                  replyQuotedSenderId: replyTo.senderId === "me" ? String(user?.dbId ?? "") : replyTo.senderId,
                  replySenderName: replyTo.senderName,
                  viewerDbId: user?.dbId,
                  chatContactName,
                  isGroup: chat?.isGroup,
                })}
              </Text>
              <Text style={[styles.replyPreviewText, { color: REPLY_PREVIEW_TEXT_COLOR }]} numberOfLines={2}>
                {replyTo.text?.trim() || messageFallback}
              </Text>
            </View>
          </Pressable>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.replyPreviewClose} hitSlop={12}>
            <Ionicons name="close-circle" size={22} color={colors.mutedForeground} />
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

      {composerLinkUrl ? (
        <ComposerLinkPreview
          url={composerLinkUrl}
          colors={colors}
          onDismiss={() => setDismissedComposerLink(composerLinkUrl)}
        />
      ) : null}

      {!selectionActive && (
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.isDark ? colors.background : "#FFFFFF",
              borderTopColor: colors.isDark ? colors.border : "rgba(0,0,0,0.06)",
              paddingBottom: inputBarBottomPad,
            },
          ]}
        >
          {voiceRecPhase !== "locked" && (
            <View
              style={[
                styles.inputPill,
                {
                  backgroundColor: colors.isDark ? colors.card : "#FFFFFF",
                  borderColor: colors.isDark ? colors.border : "rgba(0,0,0,0.08)",
                },
                voiceRecPhase === "holding" ? styles.inputPillHolding : null,
              ]}
            >
              {voiceRecPhase !== "holding" && (
                <TouchableOpacity
                  style={styles.inputPillIcon}
                  onPress={toggleEmojiPanel}
                  disabled={!composerEnabled || !!editTarget}
                >
                  <Ionicons
                    name={emojiPanelOpen ? "happy" : "happy-outline"}
                    size={22}
                    color={composerEnabled && !editTarget ? colors.mutedForeground : colors.mutedForeground + "55"}
                  />
                </TouchableOpacity>
              )}
              {voiceRecPhase === "holding" ? (
                <View style={styles.inputHoldingHint} />
              ) : (
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.inputField,
                    { color: colors.foreground },
                  ]}
                  placeholder={editTarget ? t("chat.editPlaceholder") : t("chat.placeholder")}
                  placeholderTextColor={colors.mutedForeground}
                  value={inputVal}
                  onChangeText={handleTextChange}
                  onSelectionChange={(e) => setTextSelection(e.nativeEvent.selection)}
                  multiline={!enterSendActive}
                  blurOnSubmit={false}
                  returnKeyType={enterSendActive ? "send" : "default"}
                  onSubmitEditing={enterSendActive ? () => handleSend() : undefined}
                  maxLength={CHAT_MESSAGE_MAX_CHARS}
                  editable={composerEnabled}
                  onFocus={() => {
                    setEmojiPanelOpen(false);
                    setAssistantChatInputFocused(true);
                    if (chatId && inputVal.length > 0) setTyping(chatId);
                  }}
                  onBlur={() => {
                    setAssistantChatInputFocused(false);
                    if (chatId) {
                      clearTyping(chatId);
                      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                    }
                  }}
                />
              )}
              {!inputVal.trim() && voiceRecPhase !== "holding" && (
                <TouchableOpacity
                  style={styles.inputPillIcon}
                  onPress={showAttachMenu}
                  disabled={!composerEnabled || !!editTarget}
                >
                  <Ionicons name="attach-outline" size={22} color={composerEnabled && !editTarget ? colors.mutedForeground : colors.mutedForeground + "55"} />
                </TouchableOpacity>
              )}
              {!inputVal.trim() && voiceRecPhase !== "holding" && (
                <TouchableOpacity
                  style={styles.inputPillIcon}
                  onPress={showCameraOptions}
                  disabled={!composerEnabled || !!editTarget}
                >
                  <Ionicons name="camera-outline" size={22} color={composerEnabled && !editTarget ? colors.mutedForeground : colors.mutedForeground + "55"} />
                </TouchableOpacity>
              )}
            </View>
          )}
          {inputVal.trim() && voiceRecPhase === "idle" ? (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: colors.primary }, (!composerEnabled || initializing) && { opacity: 0.5 }]}
              disabled={!composerEnabled || initializing}
              onPress={handleSend}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <VidehVoiceMic
              enabled={composerEnabled && !editTarget}
              colors={colors}
              onSend={handleVoiceNoteSend}
              onPhaseChange={setVoiceRecPhase}
              fullWidth={voiceRecPhase === "locked"}
            />
          )}
        </View>
      )}

      <ChatEmojiPanel
        visible={emojiPanelOpen && !selectionActive && voiceRecPhase === "idle"}
        backgroundColor={colors.isDark ? colors.background : "#FFFFFF"}
        borderColor={colors.isDark ? colors.border : "rgba(0,0,0,0.06)"}
        mutedColor={colors.mutedForeground}
        activeTabColor={colors.foreground}
        onPickEmoji={insertEmoji}
        onPickGif={handlePickGif}
        onPickSticker={handlePickSticker}
      />
    </>
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: wallpaper
            ? "transparent"
            : chatLook.chatBackground,
        },
      ]}
    >
      {!wallpaper && chatLook.animatedWallpaper !== "none" ? (
        <AnimatedChatWallpaper
          id={chatLook.animatedWallpaper}
          accent={chatLook.appearance.accent[0]}
          isDark={chatLook.isDark}
        />
      ) : null}
      {wallpaper ? (
        <Image
          source={{ uri: wallpaper }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      ) : null}
      {/* Header */}
      {selectionActive ? (
        <ThemedHeader accentColors={headerAccent} style={[styles.header, styles.selectionHeader, { paddingTop: topPad }]}>
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
                    setReplyTo(toReplyData(m, messageFallback));
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
                {canOpenMessageInfo ? (
                  <TouchableOpacity
                    style={styles.headerBtn}
                    onPress={openSelectedMessageInfo}
                  >
                    <Ionicons name="information-circle-outline" size={22} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => {
                const ids = selectedIds.filter((id) => {
                  const m = allMessages.find((x) => x.id === id);
                  return m && m.type !== "deleted" && !m.isViewOnce;
                });
                if (ids.length === 0) return;
                setForwardSearch("");
                setForwardIds(ids);
                clearSelection();
              }}
            >
              <Ionicons name="arrow-redo-outline" size={21} color="#fff" />
            </TouchableOpacity>
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
        </ThemedHeader>
      ) : (
        <ThemedHeader accentColors={headerAccent} style={[styles.header, { paddingTop: topPad }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerAvatarShell}
            activeOpacity={0.8}
            onPress={() => chatId && router.push({ pathname: "/chat-info/[id]", params: { id: chatId, name: displayName } })}
          >
            {contactAvatar ? (
              <Image source={{ uri: contactAvatar }} style={styles.headerAvatarImg} contentFit="cover" />
            ) : (
              <View style={[styles.headerAvatarWrap, { backgroundColor: avatarBg }]}>
                <Text style={styles.headerAvatarText}>{initials}</Text>
              </View>
            )}
            {disappearingOn ? <DisappearTimerBadge size={16} variant="header" /> : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerInfo}
            activeOpacity={0.7}
            onPress={() => chatId && router.push({ pathname: "/chat-info/[id]", params: { id: chatId, name: displayName } })}
          >
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>
                {businessChannelInfo?.displayName ?? displayName}
              </Text>
              {businessChannelInfo ? (
                <Ionicons name="checkmark-circle" size={16} color="#93C5FD" style={{ marginLeft: 4 }} />
              ) : null}
            </View>
            <Text style={[styles.headerStatus, remoteTypingNames.length > 0 && { color: "#a7f3d0" }]}>
              {headerStatusText}
            </Text>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            {!searching && (
              <>
                <TouchableOpacity
                  style={[styles.headerBtn, (chat?.isGroup || (!chat?.isGroup && (blockState.iBlockedThem || blockState.theyBlockedMe))) && { opacity: 0.45 }]}
                  disabled={Boolean(chat?.isGroup) || (!chat?.isGroup && (blockState.iBlockedThem || blockState.theyBlockedMe))}
                  onPress={() => chatId && router.push({ pathname: "/call/[id]", params: { id: chatId, type: "video", name: displayName } })}
                >
                  <Ionicons name="videocam-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.headerBtn, (chat?.isGroup || (!chat?.isGroup && (blockState.iBlockedThem || blockState.theyBlockedMe))) && { opacity: 0.45 }]}
                  disabled={Boolean(chat?.isGroup) || (!chat?.isGroup && (blockState.iBlockedThem || blockState.theyBlockedMe))}
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
        </ThemedHeader>
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
            placeholder={t("chat.searchMessages")}
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      )}

      <View style={styles.chatKeyboardAvoid}>
        <View style={styles.chatBody}>
          <FlatList
            style={styles.messageList}
            ref={listRef}
          inverted={!searching}
          data={chatListData}
          ListHeaderComponent={
            !searching && remoteTypingNames.length > 0 ? (
              <TypingIndicator
                bubbleColor={colors.chatBubbleReceived}
                dotColor={colors.mutedForeground}
                textColor={colors.mutedForeground}
                label={chat?.isGroup ? formatTypingLabel(remoteTypingNames, true) : undefined}
              />
            ) : null
          }
          ListFooterComponent={
            !searching ? (
              <>
                {loadingOlder ? (
                  <View style={styles.olderLoader}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null}
                {showBusinessIntro && businessChannelInfo ? (
                  <>
                    <BusinessSecureBanner />
                    <BusinessIntroCard
                      displayName={businessChannelInfo.displayName}
                      logoUrl={businessChannelInfo.logoUrl ?? contactAvatar}
                      joinedLabel={formatBusinessJoinedLabel(businessChannelInfo.joinedAt)}
                      isDark={colors.isDark}
                      onManageMessages={() => setManageBusinessOpen(true)}
                    />
                  </>
                ) : null}
                {showGroupWelcomeCard && groupWelcomePreview ? (
                  <>
                    <ChatEncryptionNotice />
                    <GroupWelcomeCard
                      addedByPhone={groupWelcomePreview.addedByPhone}
                      addedByName={groupWelcomePreview.addedByName}
                      creatorIsContact={groupWelcomePreview.creatorIsContact}
                      memberCount={groupWelcomePreview.memberCount}
                      contactsInGroupCount={groupWelcomePreview.contactsInGroupCount}
                      createdLabel={formatDateChipLabel(groupWelcomePreview.createdAtMs)}
                      isDark={colors.isDark}
                      onExitGroup={handleExitGroup}
                      onStay={handleStayInGroup}
                      onReport={handleReportGroup}
                    />
                  </>
                ) : null}
                {showUnsavedContactCard && peerContactPreview ? (
                  <>
                    <ChatEncryptionNotice />
                    <UnsavedContactCard
                      phone={peerContactPreview.phone}
                      profileName={peerContactPreview.profileName}
                      initials={initials}
                      avatarUrl={contactAvatar}
                      avatarBg={avatarBg}
                      commonGroupCount={peerContactPreview.commonGroupCount}
                      isDark={colors.isDark}
                      onBlock={handleMenuBlockToggle}
                      onAdd={() => { void handleAddUnsavedContact(); }}
                      onReport={() => handleMenuReport(false)}
                    />
                  </>
                ) : null}
              </>
            ) : null
          }
          keyExtractor={(row) => {
            if (row.rowType === "date") return row.id;
            const m = row.message;
            return m.stableListKey ?? m.id;
          }}
          renderItem={renderChatListRow}
          contentContainerStyle={[
            styles.messageListContent,
            {
              paddingTop: listVisualBottomPad,
              paddingBottom: listTopPadding,
              flexGrow: 1,
              justifyContent: searching
                ? "flex-start"
                : showEmptyStateLabel
                  ? "center"
                  : undefined,
            },
          ]}
          extraData={listExtraData}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS !== "web"}
          maintainVisibleContentPosition={
            searching
              ? undefined
              : {
                  minIndexForVisible: 0,
                  autoscrollToTopThreshold: readingHistory || showJumpToLatest
                    ? WHATSAPP_MVCP_HISTORY_AUTOSCROLL_THRESHOLD
                    : WHATSAPP_MVCP_FOLLOW_AUTOSCROLL_THRESHOLD,
                }
          }
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={100}
          onScrollBeginDrag={() => {
            scrollLockRef.current = true;
            userDraggingRef.current = true;
            cancelAllScrollPins();
          }}
          onScrollEndDrag={(e) => {
            scrollLockRef.current = false;
            userDraggingRef.current = false;
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            finishScrollInteraction(
              contentOffset.y,
              contentSize.height,
              layoutMeasurement.height,
            );
          }}
          onMomentumScrollEnd={(e) => {
            userDraggingRef.current = false;
            scrollLockRef.current = false;
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            finishScrollInteraction(
              contentOffset.y,
              contentSize.height,
              layoutMeasurement.height,
            );
          }}
          onScroll={(e) => {
            if (searching) return;
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            handleListScroll(contentOffset.y, contentSize.height, layoutMeasurement.height);
          }}
          scrollEventThrottle={96}
          onScrollToIndexFailed={(info) => {
            const offset = Math.max(0, info.averageItemLength * info.index);
            listRef.current?.scrollToOffset({ offset, animated: false });
            requestAnimationFrame(() => {
              listRef.current?.scrollToIndex({
                index: info.index,
                animated: true,
                viewPosition: searching ? 0.5 : 0.5,
              });
            });
          }}
          ListEmptyComponent={
            initializing ? (
              <View style={styles.initWrap}>
                <Text style={[styles.initText, { color: colors.mutedForeground }]}>{t("chat.starting")}</Text>
              </View>
            ) : searching ? (
              <View style={styles.initWrap}>
                <Text style={[styles.initText, { color: colors.mutedForeground }]}>{t("chat.noResults")}</Text>
              </View>
            ) : !messagesReady ? (
              <View style={styles.initWrap}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.initText, { color: colors.mutedForeground, marginTop: 10 }]}>
                  {t("chat.loadingMessages")}
                </Text>
              </View>
            ) : showEmptyStateLabel ? (
              <View style={styles.initWrap}>
                <Text style={[styles.initText, { color: colors.mutedForeground }]}>
                  {t("chats.noMessagesYet")}
                </Text>
              </View>
            ) : null
          }
        />

        {showJumpToLatest ? (
          <View
            pointerEvents="box-none"
            style={[styles.jumpFabHost, { bottom: jumpFabBottom }]}
          >
            <TouchableOpacity
              style={[
                unreadBelowCount > 0 ? styles.newMessagesFab : styles.scrollToBottomFab,
                {
                  backgroundColor: colors.card,
                  borderColor: unreadBelowCount > 0 ? colors.border : "transparent",
                },
              ]}
              onPress={() => pinChatToBottom(true)}
              activeOpacity={0.88}
              accessibilityLabel={
                unreadBelowCount > 0
                  ? `${unreadBelowCount} new messages`
                  : "Scroll to latest messages"
              }
            >
              <Ionicons name="chevron-down" size={20} color={colors.primary} />
              {unreadBelowCount > 0 ? (
                <Text style={[styles.newMessagesFabText, { color: colors.primary }]}>
                  {unreadBelowCount > 99
                    ? "99+ new messages"
                    : unreadBelowCount === 1
                      ? "1 new message"
                      : `${unreadBelowCount} new messages`}
                </Text>
              ) : null}
            </TouchableOpacity>
          </View>
        ) : null}

        </View>
        <KeyboardStickyView
          enabled={!selectionActive}
          offset={{ closed: 0, opened: 0 }}
        >
          <View style={styles.composerWrap} onLayout={onComposerLayout}>
            {composerFooter}
          </View>
        </KeyboardStickyView>
      </View>


      {/* Attach menu â€” Videh-style bottom sheet (coloured circles + grid) */}
      <Modal visible={cameraSheetOpen} transparent animationType="fade" onRequestClose={() => setCameraSheetOpen(false)}>
        <View style={styles.attachModalRoot}>
          <Pressable style={styles.attachBackdrop} onPress={() => setCameraSheetOpen(false)} />
          <View
            style={[
              styles.cameraChoiceSheet,
              { backgroundColor: colors.isDark ? "#1A2329" : "#fff", paddingBottom: insets.bottom + 16 },
            ]}
          >
            <Text style={[styles.cameraChoiceTitle, { color: colors.foreground }]}>Camera</Text>
            <Text style={[styles.cameraChoiceSub, { color: colors.mutedForeground }]}>Choose photo or video</Text>
            <TouchableOpacity
              style={[styles.cameraChoiceBtn, { borderColor: colors.border }]}
              onPress={() => runCameraChoice("camera")}
              activeOpacity={0.75}
            >
              <Ionicons name="camera" size={22} color={colors.primary} />
              <Text style={[styles.cameraChoiceBtnText, { color: colors.foreground }]}>Take photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cameraChoiceBtn, { borderColor: colors.border }]}
              onPress={() => runCameraChoice("videocamera")}
              activeOpacity={0.75}
            >
              <Ionicons name="videocam" size={22} color={colors.primary} />
              <Text style={[styles.cameraChoiceBtnText, { color: colors.foreground }]}>Record video</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cameraChoiceCancel} onPress={() => setCameraSheetOpen(false)}>
              <Text style={[styles.cameraChoiceCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ChatAttachSheet
        visible={attachVisible}
        colors={colors}
        insets={insets}
        onClose={() => setAttachVisible(false)}
        onAction={(type) => {
          setAttachVisible(false);
          void sendMediaMessage(type);
        }}
        onPickAssets={(items) => void handleAttachGalleryPicks(items)}
      />

      <ContactSharePickerModal
        visible={contactPickerOpen}
        colors={colors}
        onClose={() => setContactPickerOpen(false)}
        onPick={openContactPickerRow}
      />

      {/* Videh-style: confirm before sending contact */}
      <Modal
        visible={!!contactToConfirm}
        animationType="slide"
        presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
        onRequestClose={() => setContactToConfirm(null)}
      >
        {contactToConfirm ? (
          <View style={[styles.contactConfirmRoot, { backgroundColor: colors.background, paddingTop: insets.top }]}>
            <View style={[styles.contactPickerHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setContactToConfirm(null)} style={styles.contactPickerBack} hitSlop={12}>
                <Ionicons name="arrow-back" size={24} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.contactPickerTitle, { color: colors.foreground, flex: 1 }]}>Send contact</Text>
              <TouchableOpacity onPress={() => void confirmShareContact()} hitSlop={12}>
                <Ionicons name="send" size={22} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.contactConfirmBody}>
              <View style={[styles.contactConfirmAvatar, { backgroundColor: `${colors.primary}22` }]}>
                <Text style={[styles.contactConfirmAvatarTxt, { color: colors.primary }]}>
                  {(() => {
                    const parts = contactToConfirm.name.trim().split(/\s+/).filter(Boolean);
                    if (parts.length >= 2) {
                      return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
                    }
                    return (contactToConfirm.name.trim().charAt(0) || contactToConfirm.phones[0]?.charAt(0) || "?").toUpperCase();
                  })()}
                </Text>
              </View>
              <Text style={[styles.contactConfirmName, { color: colors.foreground }]}>{contactToConfirm.name}</Text>
              {contactToConfirm.phones.map((phone, i) => (
                <Text key={`${phone}-${i}`} style={[styles.contactConfirmPhone, { color: colors.mutedForeground }]}>
                  {phone}
                </Text>
              ))}
              {contactToConfirm.emails.map((email, i) => (
                <Text key={`${email}-${i}`} style={[styles.contactConfirmPhone, { color: colors.mutedForeground }]}>
                  {email}
                </Text>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.contactConfirmSendBtn, { backgroundColor: colors.primary, marginBottom: insets.bottom + 16 }]}
              onPress={() => void confirmShareContact()}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.contactConfirmSendTxt}>Send</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Modal>

      <ManageBusinessMessagesSheet
        visible={manageBusinessOpen}
        businessName={businessChannelInfo?.displayName ?? displayName}
        isMuted={!!chat?.isMuted}
        onClose={() => setManageBusinessOpen(false)}
        onToggleMute={handleToggleBusinessMute}
        onBlock={handleBlockBusiness}
      />

      {/* View received / sent contact (Save, Call) */}
      <Modal
        visible={!!viewContactMsg}
        animationType="slide"
        transparent
        onRequestClose={() => setViewContactMsg(null)}
      >
        <Pressable style={styles.contactViewBackdrop} onPress={() => setViewContactMsg(null)}>
          <Pressable
            style={[styles.contactViewSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            {viewContactMsg ? (() => {
              const parsed = parseContactMessage(viewContactMsg.text);
              if (!parsed) return null;
              return (
                <>
                  <View style={[styles.contactConfirmAvatar, { backgroundColor: `${colors.primary}22`, alignSelf: "center" }]}>
                    <Text style={[styles.contactConfirmAvatarTxt, { color: colors.primary }]}>
                      {parsed.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.contactConfirmName, { color: colors.foreground, textAlign: "center" }]}>
                    {parsed.name}
                  </Text>
                  {parsed.phones.map((phone, i) => (
                    <TouchableOpacity
                      key={`${phone}-${i}`}
                      style={[styles.contactViewAction, { borderColor: colors.border }]}
                      onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}
                    >
                      <Ionicons name="call-outline" size={20} color={colors.primary} />
                      <Text style={[styles.contactViewActionTxt, { color: colors.foreground }]}>{phone}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[styles.contactViewAction, { borderColor: colors.border }]}
                    onPress={() => { void saveSharedContactToPhone(viewContactMsg.text); }}
                  >
                    <Ionicons name={Platform.OS === "web" ? "download-outline" : "person-add-outline"} size={20} color={colors.primary} />
                    <Text style={[styles.contactViewActionTxt, { color: colors.foreground }]}>
                      {Platform.OS === "web" ? "Download contact (.vcf)" : "Add to contacts"}
                    </Text>
                  </TouchableOpacity>
                  {parsed.phones[0] ? (
                    <TouchableOpacity
                      style={[styles.contactViewAction, { borderColor: colors.border }]}
                      onPress={() => {
                        if (Platform.OS === "web") {
                          void import("@/lib/web/webVCard").then((m) => {
                            void m.copyTextToClipboard(parsed.phones[0]!);
                            Alert.alert("Copied", "Phone number copied.");
                          });
                        } else {
                          Clipboard.setString(parsed.phones[0]!);
                          Alert.alert("Copied", "Phone number copied.");
                        }
                      }}
                    >
                      <Ionicons name="copy-outline" size={20} color={colors.primary} />
                      <Text style={[styles.contactViewActionTxt, { color: colors.foreground }]}>Copy number</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.contactViewClose} onPress={() => setViewContactMsg(null)}>
                    <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>Close</Text>
                  </TouchableOpacity>
                </>
              );
            })() : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reaction picker modal */}
      <DismissibleModal
        visible={!!reactionTarget && selectedIds.length === 1 && selectedIds[0] === reactionTarget.id}
        onClose={dismissReactionPicker}
        animationType="fade"
      >
        <View style={[styles.reactionPickerWrap, { paddingBottom: insets.bottom + 96 }]}>
          <View style={[styles.reactionPicker, { backgroundColor: colors.card }]}>
            {REACTION_EMOJIS.map((e) => (
              <TouchableOpacity key={e} style={styles.reactionPickerBtn} onPress={() => {
                if (chatId && reactionTarget) { reactToMessage(chatId, reactionTarget.id, e); }
                clearSelection();
              }}>
                <Text style={{ fontSize: 28 }}>{e}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.reactionPickerPlus, { backgroundColor: colors.muted }]}
              onPress={dismissReactionPicker}
            >
              <Ionicons name="close" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        </View>
      </DismissibleModal>

      {/* Delete modal â€” centered card (Videh-style), not bottom sheet */}
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
            {bulkHasOthers && !bulkHasMine ? (
              <Text style={[styles.bulkDeleteHint, { color: colors.mutedForeground }]}>
                Removes selected messages from your chat only. Others can still see them.
              </Text>
            ) : bulkHasOthers && bulkHasMine ? (
              <Text style={[styles.bulkDeleteHint, { color: colors.mutedForeground }]}>
                Your messages can be deleted for everyone or just for you. {bulkOthersCount} from others will only be removed for you.
              </Text>
            ) : (
              <Text style={[styles.bulkDeleteHint, { color: colors.mutedForeground }]}>
                Removes selected messages you sent from this chat.
              </Text>
            )}
            {bulkAllMineDeletable ? (
              <TouchableOpacity style={styles.deleteAction} onPress={handleBulkDeleteForEveryone}>
                <Text style={styles.deleteActionText}>Delete for everyone</Text>
              </TouchableOpacity>
            ) : bulkHasMine ? (
              <TouchableOpacity style={styles.deleteAction} onPress={handleBulkDeleteForEveryone}>
                <Text style={styles.deleteActionText}>Delete my messages for everyone</Text>
              </TouchableOpacity>
            ) : null}
            {bulkDeletableMessages.length > 0 ? (
              <TouchableOpacity style={styles.deleteAction} onPress={handleBulkDeleteForMe}>
                <Text style={styles.deleteActionText}>Delete for me</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.deleteAction} onPress={() => setBulkDeleteOpen(false)}>
              <Text style={styles.deleteCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Forward modal */}
      <DismissibleModal visible={forwardIds.length > 0} onClose={() => { setForwardIds([]); setForwardSearch(""); }} animationType="slide">
        <View style={styles.forwardModalWrap}>
          <View style={[styles.forwardSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.attachTitle, { color: colors.foreground }]}>
              Forward {forwardIds.length > 1 ? `${forwardIds.length} messages` : "to Videh chat"}
            </Text>
            <Text style={[styles.forwardHint, { color: colors.mutedForeground }]}>
              Only your Videh contacts and groups. Not shared outside Videh.
            </Text>
            <TextInput
              value={forwardSearch}
              onChangeText={setForwardSearch}
              placeholder={t("chat.searchChats")}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.forwardSearchInput, { color: colors.foreground, borderColor: colors.border }]}
            />
            <ScrollView keyboardShouldPersistTaps="handled">
              {videhForwardTargets.length === 0 ? (
                <Text style={[styles.forwardEmpty, { color: colors.mutedForeground }]}>
                  No other Videh chats found.
                </Text>
              ) : videhForwardTargets.map((c) => (
                <TouchableOpacity key={c.id} style={styles.forwardRow} onPress={() => {
                  if (chatId && forwardIds.length > 0) {
                    for (const id of forwardIds) forwardMessage(chatId, id, c.id);
                  }
                  const count = forwardIds.length;
                  setForwardIds([]);
                  setForwardSearch("");
                  Alert.alert("Forwarded", count > 1 ? `Sent ${count} messages to ${c.name}` : `Sent to ${c.name} on Videh`);
                }}>
                  <View style={[styles.forwardAvatar, { backgroundColor: `hsl(${(c.name.charCodeAt(0) * 37) % 360},50%,40%)` }]}>
                    {c.avatar ? <Image source={{ uri: c.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" /> : (
                      <Text style={{ color: "#fff", fontFamily: "Inter_700Bold" }}>{c.name[0]?.toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.forwardName, { color: colors.foreground }]}>{c.name}</Text>
                    <Text style={[styles.forwardSub, { color: colors.mutedForeground }]}>
                      {c.isGroup ? "Group" : "Videh contact"}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </DismissibleModal>

      <ChatAlbumGalleryModal
        visible={!!albumGallery}
        urls={albumGallery?.urls ?? []}
        initialIndex={albumGallery?.index ?? 0}
        sessionToken={user?.sessionToken}
        caption={albumGallery?.caption}
        onClose={() => setAlbumGallery(null)}
        onSave={(uri) => { void saveImageToGallery(uri); }}
      />

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
            <Image
              source={
                mediaPreview.uri.includes("/api/chats/media/") && user?.sessionToken
                  ? { uri: mediaPreview.uri, headers: authFetchHeaders(user.sessionToken) as Record<string, string> }
                  : { uri: mediaPreview.uri }
              }
              style={styles.mediaPreviewImage}
              contentFit="contain"
            />
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
  chatKeyboardAvoid: { flex: 1, minHeight: 0, flexDirection: "column" },
  chatBody: { flex: 1, minHeight: 0, position: "relative" },
  composerWrap: { flexShrink: 0 },
  messageList: { flex: 1, minHeight: 0 },
  messageListContent: { paddingHorizontal: 10, paddingTop: 8 },
  jumpFabHost: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 8,
  },
  scrollToBottomFab: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  newMessagesFab: {
    minWidth: 168,
    maxWidth: "92%",
    height: 40,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  newMessagesFabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  olderLoader: { paddingVertical: 12, alignItems: "center" },
  // @mention autocomplete
  mentionList: { borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.1)", maxHeight: 220, elevation: 4, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4 },
  mentionRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12, borderBottomWidth: 0.5 },
  mentionAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  mentionAvatarText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  mentionName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 8, paddingBottom: 10, gap: 6 },
  selectionHeader: {},
  selectionHeaderActions: { flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 0 },
  backBtn: { padding: 6 },
  headerAvatarShell: { width: 38, height: 38, position: "relative", overflow: "visible" },
  headerAvatarWrap: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  headerAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  headerInfo: { flex: 1 },
  headerNameRow: { flexDirection: "row", alignItems: "center", maxWidth: "100%" },
  headerName: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  headerStatus: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 16 },
  headerActions: { flexDirection: "row" },
  headerBtn: { padding: 6 },
  searchBar: { flexDirection: "row", alignItems: "center", margin: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  initWrap: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 24 },
  initText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#8696A0" },
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
  bubbleTailWrap: { position: "relative", maxWidth: "82%", flexShrink: 1 },
  bubbleTailSvg: { position: "absolute", bottom: 0, zIndex: 1 },
  bubble: {
    maxWidth: "100%",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0.5 },
    shadowOpacity: 0.11,
    shadowRadius: 1.5,
    alignSelf: "flex-start",
  },
  bubbleCompact: {
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
  },
  msgTextCompact: {
    flexShrink: 1,
  },
  /** Bottom corners even; SVG tail sits at corner */
  bubbleWithTailShape: { borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  bubbleDeleted: { paddingVertical: 7, paddingHorizontal: 9, minWidth: 190, maxWidth: W * 0.78 },
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
  replyStrip: {
    borderLeftWidth: 4,
    paddingLeft: 10,
    paddingRight: 8,
    marginBottom: 6,
    marginTop: 2,
    marginHorizontal: 2,
    paddingVertical: 6,
    borderRadius: 6,
    maxWidth: "100%",
    minWidth: 0,
  },
  replyStripTextCol: { minWidth: 0, flexShrink: 1 },
  replyWho: { fontSize: 12.5, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  replyText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 17 },
  msgText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  },
  msgImage: { width: W * 0.62, height: W * 0.62, borderRadius: 12 },
  imageFallbackBg: { backgroundColor: "#111827", alignItems: "center", justifyContent: "center", gap: 8 },
  imageFallbackText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  msgVideo: { width: W * 0.62, height: W * 0.62, borderRadius: 12, backgroundColor: "#000" },
  videoFallbackBg: { alignItems: "center", justifyContent: "center" },
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
  mediaBubbleWrap: { position: "relative" },
  mediaUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  mediaUploadDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.38)" },
  mediaUploadCenter: { alignItems: "center", gap: 6 },
  mediaUploadPct: { color: "#fff", fontSize: 11, fontWeight: "700" },
  mediaUploadFailedText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  viewOnceOverlay: { position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  viewOnceText: { color: "#fff", fontSize: 11, fontFamily: "Inter_500Medium" },
  viewOncePlaceholder: {
    width: 220,
    height: 160,
    borderRadius: 10,
    backgroundColor: "#1f2c34",
    alignItems: "center",
    justifyContent: "center",
  },
  viewOncePlaceholderBadge: {
    position: "absolute",
    bottom: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  viewOnceOpened: {
    width: 220,
    minHeight: 72,
    borderRadius: 10,
    backgroundColor: "#1f2c34",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 4,
  },
  viewOnceOpenedText: { color: "#8696a0", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  viewOnceOpenedSub: { color: "#667781", fontSize: 12, fontFamily: "Inter_400Regular" },
  callBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
    minWidth: 210,
    maxWidth: W * 0.72,
  },
  callBubbleIcon: { flexShrink: 0 },
  callBubbleText: { flex: 1, fontSize: 14.5, fontFamily: "Inter_500Medium", lineHeight: 19 },
  translatedBox: { marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.15)" },
  translatedLabel: { fontSize: 10, color: "#00A884", fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  docCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, minWidth: 220 },
  docIcon: { width: 48, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  docMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  locationBubbleWrap: { overflow: "hidden", borderRadius: 12, minWidth: W * 0.62, maxWidth: W * 0.82 },
  locationMapPreview: {
    width: W * 0.62,
    height: 200,
    backgroundColor: "#dfe6e4",
    overflow: "hidden",
    position: "relative",
  },
  locationMapImg: { ...StyleSheet.absoluteFillObject, backgroundColor: "#dfe6e4" },
  locationMapFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: "#dfe6e4" },
  locationMapPatch: { position: "absolute", borderRadius: 18, opacity: 0.78 },
  locationMapPatchA: { width: 170, height: 95, left: -22, top: 16, backgroundColor: "#cfe3d5", transform: [{ rotate: "-10deg" }] },
  locationMapPatchB: { width: 150, height: 100, right: -32, bottom: 8, backgroundColor: "#e8dccd", transform: [{ rotate: "13deg" }] },
  locationMapRoad: { position: "absolute", backgroundColor: "#fff", borderColor: "#d6d9d6", borderWidth: 1 },
  locationMapRoadH: { height: 18, left: -18, right: -18, top: 78, transform: [{ rotate: "-5deg" }] },
  locationMapRoadV: { width: 18, top: -24, bottom: -24, left: "49%", transform: [{ rotate: "8deg" }] },
  locationMapRoadDiag: { height: 14, left: -28, right: -28, bottom: 45, transform: [{ rotate: "22deg" }] },
  locationMapRiver: { position: "absolute", width: 44, top: -18, bottom: -18, right: 40, backgroundColor: "#b8d8ef", opacity: 0.65, transform: [{ rotate: "-16deg" }] },
  locationMapTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(255,255,255,0.08)" },
  locationPinWrap: { position: "absolute", left: "50%", top: "50%", alignItems: "center", transform: [{ translateX: -22 }, { translateY: -40 }] },
  locationPinCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E53935",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  locationAvatarPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#fff",
    backgroundColor: "#00A884",
  },
  locationPinStem: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#E53935",
    marginTop: -3,
  },
  locationMapCredit: { position: "absolute", left: 8, bottom: 7, backgroundColor: "rgba(255,255,255,0.86)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  locationMapCreditText: { color: "#4b5563", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  locationLiveBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  locationLiveIconGroup: { flexDirection: "row", alignItems: "center", gap: 2 },
  locationLiveSmall: { fontSize: 11, fontFamily: "Inter_400Regular" },
  locationLiveTime: { fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 1 },
  locationStaticFooter: {
    backgroundColor: "rgba(255,255,255,0.96)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  locationStaticTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  locationCoords: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  locationLiveMeta: { marginTop: 6, gap: 2 },
  locationOpenMapsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  locationOpenMapsText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
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
  msgMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    marginTop: 2,
    alignSelf: "stretch",
    flexShrink: 0,
    minHeight: 16,
  },
  msgMetaCall: { marginTop: 2, paddingRight: 2 },
  msgMetaOnMedia: {
    position: "absolute",
    right: 6,
    bottom: 6,
    marginTop: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
    flexShrink: 0,
    maxWidth: "92%",
  },
  editedLabel: { fontSize: 10, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  msgTime: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  },
  deletedRowWa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 1,
    minWidth: 172,
  },
  deletedIconWa: { marginTop: 1 },
  deletedTextWa: {
    flexShrink: 1,
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
  replyPreviewBar: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingRight: 8,
    minHeight: 56,
  },
  replyPreview: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 4,
    marginVertical: 6,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  replyPreviewTextCol: { minWidth: 0, flexShrink: 1 },
  replyPreviewClose: { padding: 6 },
  replyPreviewLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  replyPreviewText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
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
    paddingHorizontal: 6,
    paddingTop: 6,
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 44,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 2,
    paddingRight: 4,
  },
  inputPillHolding: { alignItems: "center" },
  inputHoldingHint: { flex: 1, justifyContent: "center", paddingHorizontal: 8, minHeight: 44 },
  inputPillIcon: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  inputField: {
    flex: 1,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === "ios" ? 11 : 10,
    paddingBottom: Platform.OS === "ios" ? 11 : 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: "transparent",
    ...(Platform.OS === "android" ? { textAlignVertical: "center" as const } : {}),
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
  cameraChoiceSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  cameraChoiceTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  cameraChoiceSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4, marginBottom: 16 },
  cameraChoiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  cameraChoiceBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  cameraChoiceCancel: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  cameraChoiceCancelText: { fontSize: 15, fontFamily: "Inter_500Medium" },
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
  forwardSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "70%" },
  forwardHint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 10 },
  forwardSearchInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  forwardEmpty: { textAlign: "center", paddingVertical: 24, fontFamily: "Inter_400Regular", fontSize: 14 },
  forwardRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  forwardSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
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
  contactConfirmRoot: { flex: 1 },
  contactConfirmBody: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 8 },
  contactConfirmAvatar: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  contactConfirmAvatarTxt: { fontSize: 32, fontFamily: "Inter_700Bold" },
  contactConfirmName: { fontSize: 22, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  contactConfirmPhone: { fontSize: 16, fontFamily: "Inter_400Regular", textAlign: "center" },
  contactConfirmSendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
  },
  contactConfirmSendTxt: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  contactViewBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  contactViewSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 24, paddingHorizontal: 20, gap: 10 },
  contactViewAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  contactViewActionTxt: { fontSize: 16, fontFamily: "Inter_500Medium", flex: 1 },
  contactViewClose: { alignItems: "center", paddingVertical: 14 },
});
