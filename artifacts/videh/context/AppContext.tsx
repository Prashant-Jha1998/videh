import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, AppState, Platform, type AppStateStatus } from "react-native";
import { agentDebugLog } from "@/lib/agentDebugLog";
import { connectChatEventStream } from "@/lib/connectChatEventStream";
import { emitChatMessageSignal, onChatMessageSignal, type ChatMessageSignal } from "@/lib/chatMessageEvents";
import {
  deliverPremiumChatMessageNotification,
  setNotificationActiveChatId,
  setNotificationRuntimeState,
} from "@/lib/incomingMessageNotify";
import * as Location from "expo-location";
import { getApiUrl } from "@/lib/api";
import { registerPushTokenWithServer } from "@/lib/pushNotifications";
import { encodeLocationPayload, mapsUrl as buildMapsUrl } from "@/lib/locationMessage";
import { safeJsonParse } from "@/lib/safeJson";
import { loadChatMediaSettings } from "@/lib/chatMediaSettings";
import { shouldAutoDownload } from "@/lib/chatMediaNetwork";
import { cacheChatImageUrl, cacheChatVideoUrl } from "@/lib/cacheChatMedia";
import { uploadChatMediaWithProgress } from "@/lib/chatMediaUpload";
import { ensureUploadableFileUri } from "@/lib/prepareFileUpload";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";
import { encodeVoiceMessageText, stripWaveformMeta } from "@/lib/voiceWaveform";
import { messageReplyPreviewText } from "@/lib/messageReplyPreview";
import { inferChatListPreview, normalizeMessageType } from "@/lib/normalizeMessage";
import { parseLocationPayload } from "@/lib/locationMessage";
import {
  loadChatMessageCache,
  rememberChatMessagesInStore,
  schedulePersistChatMessageCache,
  type CachedChatMessage,
  type ChatMessageCacheStore,
} from "@/lib/chatMessageCache";

const BASE_URL = getApiUrl();
const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
let authSessionToken: string | null = null;

const getStatusExpiryTime = (status: Status) => status.expiresAt ?? status.timestamp + STATUS_LIFETIME_MS;
const isStatusActive = (status: Status) => getStatusExpiryTime(status) > Date.now();

const api = async (path: string, options?: RequestInit) => {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(authSessionToken ? { Authorization: `Bearer ${authSessionToken}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  return res.json();
};

const authHeaders = (extra?: Record<string, string>) => ({
  ...(authSessionToken ? { Authorization: `Bearer ${authSessionToken}` } : {}),
  ...(extra ?? {}),
});

export interface UserProfile {
  id: string;
  dbId?: number;
  name: string;
  phone: string;
  about: string;
  avatar?: string;
  sessionToken?: string;
}

export interface MessageReaction {
  emoji: string;
  userId: number;
}

export interface Message {
  id: string;
  text: string;
  timestamp: number;
  senderId: string;
  senderName?: string;
  type: "text" | "image" | "video" | "audio" | "document" | "location" | "contact" | "deleted" | "call";
  status: "sent" | "delivered" | "read";
  mediaUrl?: string;
  isStarred?: boolean;
  isForwarded?: boolean;
  forwardCount?: number;
  isViewOnce?: boolean;
  viewOnceOpened?: boolean;
  isEdited?: boolean;
  editedAt?: number;
  reactions?: MessageReaction[];
  chatId?: string;
  chatName?: string;
  replyToId?: string;
  replyText?: string;
  replySenderName?: string;
  replyType?: string;
  replyQuotedSenderId?: string;
  /** Bytes; shown on document bubbles (Videh-style). */
  fileSizeBytes?: number;
  /** 0–99 while uploading; undefined when sent. */
  uploadProgress?: number;
  uploadFailed?: boolean;
  /** 0–99 while downloading on receiver; undefined when cached. */
  downloadProgress?: number;
  /** Stable on-device copy for documents (open before/without server download). */
  localMediaUri?: string;
}

const OLDER_MESSAGES_PAGE = 40;

function mapServerRowToMessage(m: any, viewerDbId: number | undefined, prevLocal?: Message): Message {
  const isMe = String(m.sender_id) === String(viewerDbId);
  let status: "sent" | "delivered" | "read" = "sent";
  if (isMe) {
    if (m.delivery_status === "read") status = "read";
    else if (m.delivery_status === "delivered") status = "delivered";
  }
  const content = m.is_deleted ? "This message was deleted" : (m.content ?? "");
  const mediaUrl = m.media_url ?? undefined;
  const type = m.is_deleted
    ? "deleted"
    : normalizeMessageType(m.type, content, mediaUrl);
  return {
    id: String(m.id),
    text: content,
    timestamp: new Date(m.created_at).getTime(),
    senderId: isMe ? "me" : String(m.sender_id),
    senderName: m.sender_name ?? undefined,
    type,
    status,
    mediaUrl,
    isStarred: m.is_starred,
    isForwarded: m.is_forwarded,
    forwardCount: m.forward_count ?? 0,
    isViewOnce: m.is_view_once,
    viewOnceOpened: !!m.view_once_opened_at,
    isEdited: !!m.edited_at,
    editedAt: m.edited_at ? new Date(m.edited_at).getTime() : undefined,
    reactions: m.reactions ?? [],
    replyToId: m.reply_to_id ? String(m.reply_to_id) : undefined,
    replyType: m.reply_type ?? undefined,
    replyQuotedSenderId: m.reply_sender_id != null ? String(m.reply_sender_id) : undefined,
    replyText: m.reply_content
      ? messageReplyPreviewText({
          type: m.reply_is_deleted ? "deleted" : (m.reply_type ?? "text"),
          text: m.reply_content,
          senderId: String(m.reply_sender_id) === String(viewerDbId) ? "me" : String(m.reply_sender_id),
          isDeleted: !!m.reply_is_deleted,
        })
      : undefined,
    replySenderName: m.reply_sender_name ?? undefined,
    localMediaUri: prevLocal?.localMediaUri,
    downloadProgress: prevLocal?.downloadProgress,
    uploadProgress: prevLocal?.uploadProgress,
    uploadFailed: prevLocal?.uploadFailed,
    fileSizeBytes: prevLocal?.fileSizeBytes,
  };
}

export interface Chat {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
  isGroup: boolean;
  isOnline?: boolean;
  members?: string[];
  messages: Message[];
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  otherUserId?: number;
}

export interface Status {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  type: "text" | "image" | "video";
  mediaUrl?: string;
  timestamp: number;
  expiresAt?: number;
  isBoosted?: boolean;
  boostEndsAt?: number;
  boostStatus?: "pending_verification" | "active" | "rejected";
  boostVerificationNote?: string;
  editorData?: StoryEditorData;
  viewed: boolean;
  backgroundColor?: string;
}

export type StoryEditorOverlay =
  | { id: string; kind: "text"; text: string; x: number; y: number; color: string; size: number }
  | { id: string; kind: "sticker"; text: string; x: number; y: number; size: number };

export type StoryEditorStroke = {
  id: string;
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>;
};

export type StoryEditorData = {
  overlays?: StoryEditorOverlay[];
  strokes?: StoryEditorStroke[];
  musicUri?: string;
  musicName?: string;
  trimStartMs?: number;
  trimEndMs?: number;
};

export interface Contact {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
  isOnVideh: boolean;
  isBlocked?: boolean;
}

export interface CallLog {
  id: string;
  chatId?: string;
  name: string;
  phone?: string;
  avatar?: string;
  type: "audio" | "video";
  direction: "incoming" | "outgoing";
  status: "answered" | "missed" | "declined";
  timestamp: number;
  duration?: number;
}

interface AppContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  chats: Chat[];
  statuses: Status[];
  contacts: Contact[];
  callLogs: CallLog[];
  setUser: (user: UserProfile) => Promise<void>;
  logout: () => Promise<void>;
  sendMessage: (
    chatId: string,
    text: string,
    replyToId?: string,
    replyQuote?: { replyText: string; replySenderName?: string; replyQuotedSenderId?: string; replyType?: string },
  ) => void;
  createGroup: (name: string, memberIds: number[], groupAvatarUrl?: string) => void;
  markAsRead: (chatId: string) => void;
  markAllAsRead: () => Promise<void>;
  addStatus: (content: string, type: "text" | "image" | "video", bg?: string, mediaUrl?: string, videoDurationMs?: number | null, editorData?: StoryEditorData) => Promise<void> | undefined;
  deleteStatus: (statusId: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => void;
  pinChat: (chatId: string) => void;
  muteChat: (chatId: string) => void;
  archiveChat: (chatId: string, archived?: boolean) => void;
  starMessage: (chatId: string, messageId: string) => void;
  forwardMessage: (chatId: string, messageId: string, targetChatId: string) => void;
  starredMessages: Message[];
  updateAvatar: (base64: string, mimeType?: string) => Promise<void>;
  createDirectChat: (otherUserId: number, otherName: string, otherAvatar?: string) => Promise<string>;
  loadMessages: (chatId: string) => Promise<void>;
  applyIncomingMessageHint: (signal: ChatMessageSignal) => void;
  loadOlderMessages: (
    chatId: string,
    beforeTimestamp: number,
  ) => Promise<{ loaded: number; hasMore: boolean }>;
  refreshChats: () => Promise<void>;
  clearAllChatHistory: () => Promise<void>;
  sendImageMessage: (chatId: string, mediaUri: string, caption?: string, isViewOnce?: boolean, mediaKind?: "image" | "video") => void;
  sendPreparedMediaMessage: (
    chatId: string,
    opts: { mediaUrl: string; kind: "image" | "video"; caption?: string; isViewOnce?: boolean },
  ) => void;
  consumeViewOnceMessage: (chatId: string, messageId: string) => Promise<string | null>;
  sendAudioMessage: (chatId: string, audioUri: string, durationSecs: number, waveform?: number[]) => void;
  sendDocumentMessage: (
    chatId: string,
    localUri: string,
    filename: string,
    fileSizeBytes: number,
    mimeType: string,
  ) => void;
  sendContactMessage: (chatId: string, contact: { name: string; phones: string[]; emails?: string[] }) => void;
  setTyping: (chatId: string) => void;
  clearTyping: (chatId: string) => void;
  deleteForEveryone: (chatId: string, messageId: string) => void;
  editMessage: (chatId: string, messageId: string, newText: string) => void;
  reactToMessage: (chatId: string, messageId: string, emoji: string) => void;
  markStatusViewedLocally: (statusId: string) => void;
  blockUser: (otherUserId: number) => Promise<void>;
  unblockUser: (otherUserId: number) => Promise<void>;
  reportUser: (otherUserId: number, args?: { chatId?: string; reason?: string; details?: string; block?: boolean }) => Promise<void>;
  setChatDisappear: (chatId: string, seconds: number | null) => Promise<void>;
  updateLocationOnServer: (chatId: string, messageId: string, body: { content?: string; mediaUrl?: string }) => Promise<void>;
  startLiveLocationSession: (args: { chatId: string; messageId: string; untilMs: number; comment?: string }) => void;
  stopLiveLocationSession: () => void;
  setActiveChatId: (chatId: string | null) => void;
  refreshCallLogs: () => Promise<void>;
  /** Who is typing per chat (names), updated via API poll + realtime. */
  typingByChatId: Record<string, string[]>;
  reportRemoteTyping: (chatId: string, names: string[]) => void;
  patchChatMessage: (chatId: string, messageId: string, patch: Partial<Message>) => void;
}

const AppContext = createContext<AppContextType | null>(null);


export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [contacts] = useState<Contact[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [typingByChatId, setTypingByChatId] = useState<Record<string, string[]>>({});
  const userRef = useRef<UserProfile | null>(null);
  userRef.current = user;
  const refreshInFlightRef = useRef({ chats: false, statuses: false, calls: false });
  const liveLocationTickingRef = useRef(false);
  const activeChatIdRef = useRef<string | null>(null);
  const clearedHistoryAtRef = useRef<number>(0);
  const messageCacheStoreRef = useRef<ChatMessageCacheStore>({});
  const loadMessagesRef = useRef<(chatId: string) => Promise<void>>(async () => {});
  const formatLastMessagePreview = (lastMsg: {
    is_deleted?: boolean;
    type?: string;
    content?: string;
    media_url?: string;
  } | null | undefined): string | undefined => {
    if (!lastMsg) return undefined;
    if (lastMsg.is_deleted) return "This message was deleted";
    const preview = inferChatListPreview(lastMsg.type, String(lastMsg.content ?? ""), lastMsg.media_url);
    if (preview === "Location") {
      const loc = parseLocationPayload(String(lastMsg.content ?? ""));
      const isLive = loc?.mode === "live" && !loc?.stopped;
      const label = loc?.label?.trim();
      const base = isLive ? "📍 Live location" : "📍 Location";
      return label ? `${base} · ${label}` : base;
    }
    if (preview === "Voice message") return "🎤 Voice message";
    return preview || undefined;
  };

  /** Chat-list preview for a locally-held Message (handles location/media/etc). */
  const messagePreviewText = (
    m: { type?: string; text?: string; mediaUrl?: string } | null | undefined,
  ): string | undefined =>
    formatLastMessagePreview(
      m
        ? {
            type: m.type,
            content: m.text,
            media_url: m.mediaUrl,
            is_deleted: m.type === "deleted",
          }
        : null,
    );

  const mapDbChats = (rows: any[]): Chat[] =>
    rows.map((c: any) => {
      const otherUser = c.other_members?.[0];
      const lastMsg = c.last_message;
      return {
        id: String(c.id),
        name: c.is_group ? (c.group_name ?? "Group") : (otherUser?.name ?? "Unknown"),
        avatar: resolvePublicAssetUrl(c.is_group ? c.group_avatar_url : otherUser?.avatar_url),
        lastMessage: formatLastMessagePreview(lastMsg),
        lastMessageTime: lastMsg ? new Date(lastMsg.created_at).getTime() : undefined,
        unreadCount: c.unread_count ?? 0,
        isGroup: c.is_group,
        isOnline: otherUser?.is_online ?? false,
        messages: [],
        isPinned: c.is_pinned ?? false,
        isMuted: c.is_muted ?? false,
        isArchived: c.is_archived ?? false,
        otherUserId: otherUser?.id,
      };
    });

  const getMimeTypeFromUri = (uri: string, fallback: string): string => {
    const clean = uri.split("?")[0].toLowerCase();
    if (clean.endsWith(".png")) return "image/png";
    if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
    if (clean.endsWith(".webp")) return "image/webp";
    if (clean.endsWith(".mp4")) return "video/mp4";
    if (clean.endsWith(".mov")) return "video/quicktime";
    if (clean.endsWith(".m4a")) return "audio/mp4";
    if (clean.endsWith(".aac")) return "audio/aac";
    if (clean.endsWith(".mp3")) return "audio/mpeg";
    if (clean.endsWith(".wav")) return "audio/wav";
    return fallback;
  };

  const uploadStatusMedia = useCallback(async (uri: string, fallbackMime: string): Promise<string> => {
    if (!uri || uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("data:")) return uri;
    const mime = getMimeTypeFromUri(uri, fallbackMime);
    const ext = mime.includes("video")
      ? mime.includes("quicktime") ? "mov" : "mp4"
      : mime.includes("audio")
        ? mime.includes("mpeg") ? "mp3" : "m4a"
        : mime.includes("png") ? "png" : "jpg";
    const form = new FormData();
    form.append("file", {
      uri,
      name: `status_${Date.now()}.${ext}`,
      type: mime,
    } as any);
    const res = await fetch(`${BASE_URL}/api/statuses/media`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    const data = await res.json().catch(() => ({})) as { success?: boolean; url?: string; message?: string };
    if (!res.ok || !data.success || !data.url) {
      throw new Error(data.message ?? "Could not upload story media.");
    }
    return data.url;
  }, []);

  const uploadChatMedia = useCallback(async (uri: string, fallbackMime: string): Promise<string> => {
    if (!uri) return uri;
    if (uri.startsWith("data:") || uri.startsWith("http://") || uri.startsWith("https://")) return uri;
    const mime = getMimeTypeFromUri(uri, fallbackMime);
    const ext = mime.includes("video")
      ? mime.includes("quicktime") ? "mov" : "mp4"
      : mime.includes("audio")
        ? (() => {
            const lower = uri.toLowerCase();
            if (lower.includes(".mp3")) return "mp3";
            if (lower.includes(".wav")) return "wav";
            if (lower.includes(".aac")) return "aac";
            if (lower.includes(".3gp")) return "3gp";
            if (lower.includes(".caf")) return "caf";
            if (lower.includes(".amr")) return "amr";
            if (lower.includes(".ogg")) return "ogg";
            return mime.includes("mpeg") ? "mp3" : "m4a";
          })()
        : mime.includes("pdf") ? "pdf"
          : mime.includes("png") ? "png" : "jpg";
    const uploaded = await uploadChatMediaWithProgress({
      uri,
      mime,
      filename: `chat_${Date.now()}.${ext}`,
      sessionToken: authSessionToken,
    });
    return uploaded.url;
  }, []);

  const toShareableMediaUri = useCallback(async (uri: string, fallbackMime: string): Promise<string> => {
    if (!uri) return uri;
    if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
    if (!uri.startsWith("data:")) {
      return uploadChatMedia(uri, fallbackMime);
    }
    if (fallbackMime.includes("video")) {
      throw new Error("Video upload failed. Please try again with a smaller clip.");
    }
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const mime = getMimeTypeFromUri(uri, fallbackMime);
      return `data:${mime};base64,${base64}`;
    } catch {
      try {
        const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "";
        if (!cacheDir) return uri;
        const ext = fallbackMime.includes("video")
          ? "mp4"
          : fallbackMime.includes("audio")
            ? "m4a"
            : "jpg";
        const copiedPath = `${cacheDir}share_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: copiedPath });
        const copiedBase64 = await FileSystem.readAsStringAsync(copiedPath, { encoding: FileSystem.EncodingType.Base64 });
        return `data:${fallbackMime};base64,${copiedBase64}`;
      } catch {
        return uri;
      }
    }
  }, [uploadChatMedia]);

  const loadChats = useCallback(async (dbUserId: number) => {
    try {
      const data = await api(`/chats/user/${dbUserId}`) as { success: boolean; chats: any[] };
      if (!data.success || !data.chats) return;
      const mapped = mapDbChats(data.chats);
      setChats((prev) =>
        mapped.map((newChat) => {
          const old = prev.find((c) => c.id === newChat.id);
          const cached = messageCacheStoreRef.current[String(newChat.id)] as Message[] | undefined;
          const messages =
            old?.messages?.length
              ? old.messages
              : cached?.length
                ? (cached as Message[])
                : [];
          return {
            ...newChat,
            messages,
            isPinned: newChat.isPinned ?? old?.isPinned,
            isMuted: newChat.isMuted ?? old?.isMuted,
            isArchived: newChat.isArchived ?? old?.isArchived,
          };
        }),
      );
      const prefetchIds = mapped
        .slice()
        .sort((a, b) => (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0))
        .slice(0, 5)
        .map((c) => c.id)
        .filter((id) => !(messageCacheStoreRef.current[id]?.length));
      if (prefetchIds.length > 0) {
        setTimeout(() => {
          for (const id of prefetchIds) void loadMessagesRef.current(id);
        }, 0);
      }
    } catch {}
  }, []);

  const loadCallLogs = useCallback(async (dbUserId: number) => {
    try {
      const data = await api(`/calls/user/${dbUserId}`) as { success: boolean; calls: any[] };
      if (!data.success || !data.calls) return;
      const logs: CallLog[] = data.calls.map((c: any) => ({
        id: String(c.id),
        chatId: c.chat_id != null ? String(c.chat_id) : undefined,
        name: c.other_user_name ?? "Unknown",
        phone: c.other_user_phone,
        avatar: c.other_user_avatar ?? undefined,
        type: c.type === "video" ? "video" : "audio",
        direction: c.direction === "outgoing" ? "outgoing" : "incoming",
        status: c.status === "answered" ? "answered" : c.status === "declined" ? "declined" : "missed",
        timestamp: new Date(c.created_at).getTime(),
        duration: c.duration_seconds ?? undefined,
      }));
      setCallLogs(logs);
    } catch {}
  }, []);

  const loadStatuses = useCallback(async (dbUserId: number) => {
    try {
      const data = await api(`/statuses/user/${dbUserId}`) as { success: boolean; statuses: any[] };
      if (!data.success || !data.statuses) return;
      const me = userRef.current;
      const mapped: Status[] = data.statuses.map((s: any) => {
        const isMe = Number(s.user_id) === Number(dbUserId);
        return {
          id: String(s.id),
          userId: isMe ? "me" : String(s.user_id),
          userName: isMe
            ? (me?.name ?? s.user_name ?? "You")
            : (s.user_name ?? "Unknown"),
          userAvatar: isMe
            ? (me?.avatar ?? s.user_avatar ?? undefined)
            : (s.user_avatar ?? undefined),
          content: s.content ?? "",
          type: s.type ?? "text",
          mediaUrl: s.media_url ?? undefined,
          timestamp: new Date(s.created_at).getTime(),
          expiresAt: s.expires_at ? new Date(s.expires_at).getTime() : undefined,
          isBoosted: Boolean(s.is_boosted),
          boostEndsAt: s.boost_ends_at ? new Date(s.boost_ends_at).getTime() : undefined,
          boostStatus: s.boost_status ?? undefined,
          boostVerificationNote: s.boost_verification_note ?? undefined,
          editorData: s.editor_data ?? undefined,
          viewed: Boolean(s.viewed),
          backgroundColor: s.background_color ?? "#00A884",
        };
      }).filter(isStatusActive);
      setStatuses(mapped);
    } catch {}
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const stored = await AsyncStorage.getItem("videh_user");
        if (stored) {
          const parsed = safeJsonParse<UserProfile | null>(stored, null);
          if (!parsed?.id) return;
          authSessionToken = parsed.sessionToken ?? null;
          setUserState(parsed);
          setIsAuthenticated(true);
          if (parsed.dbId) {
            messageCacheStoreRef.current = await loadChatMessageCache(parsed.dbId);
            loadChats(parsed.dbId);
            loadCallLogs(parsed.dbId);
            loadStatuses(parsed.dbId);
            void import("@/lib/privacySettings").then(({ fetchPrivacySettings, cachePrivacyFlags }) =>
              fetchPrivacySettings(parsed.dbId!, parsed.sessionToken).then((s) => {
                if (s) void cachePrivacyFlags(s);
              }),
            );
            if (Platform.OS !== "web") {
              registerPushTokenWithServer(parsed.dbId).catch(() => {});
            }
          }
        }
      } catch {}
      finally {
        setIsInitialized(true);
      }
    };
    loadUser();
  }, []);

  // Videh-like expiry: hide status locally as soon as the 24-hour window ends.
  useEffect(() => {
    const expiryTimer = setInterval(() => {
      setStatuses((prev) => prev.filter(isStatusActive));
    }, 30000);
    return () => clearInterval(expiryTimer);
  }, []);

  // Online presence tracking via AppState
  useEffect(() => {
    const uid = userRef.current?.dbId;
    if (uid && AppState.currentState === "active") {
      api(`/users/${uid}/online`, { method: "POST" }).catch(() => {});
    }
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const activeUid = userRef.current?.dbId;
      if (!activeUid) return;
      if (nextState === "active") {
        api(`/users/${activeUid}/online`, { method: "POST" }).catch(() => {});
        if (Platform.OS !== "web") {
          registerPushTokenWithServer(activeUid).catch(() => {});
        }
      } else if (nextState === "background" || nextState === "inactive") {
        api(`/users/${activeUid}/offline`, { method: "POST" }).catch(() => {});
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [isAuthenticated]);

  const setUser = useCallback(async (u: UserProfile) => {
    authSessionToken = u.sessionToken ?? null;
    setUserState(u);
    setIsAuthenticated(true);
    await AsyncStorage.setItem("videh_user", JSON.stringify(u));

    if (u.dbId) {
      loadChats(u.dbId);
      loadCallLogs(u.dbId);
      loadStatuses(u.dbId);
      void import("@/lib/privacySettings").then(({ fetchPrivacySettings, cachePrivacyFlags }) =>
        fetchPrivacySettings(u.dbId!, u.sessionToken).then((s) => {
          if (s) void cachePrivacyFlags(s);
        }),
      );
      api(`/users/${u.dbId}/online`, { method: "POST" }).catch(() => {});
      try {
        await api(`/users/${u.dbId}`, {
          method: "PUT",
          body: JSON.stringify({ name: u.name, about: u.about }),
        });
      } catch {}

      if (Platform.OS !== "web") {
        try {
          await registerPushTokenWithServer(u.dbId);
        } catch {}
      }
    }
  }, [loadChats, loadStatuses]);

  const refreshChats = useCallback(async () => {
    const u = userRef.current;
    if (u?.dbId) await loadChats(u.dbId);
  }, [loadChats]);

  useEffect(() => {
    void AsyncStorage.getItem("chatHistoryClearedAt").then((v) => {
      const n = v ? Number(v) : 0;
      if (Number.isFinite(n)) clearedHistoryAtRef.current = n;
    });
  }, []);

  /** WhatsApp-style "clear all chats": hides existing message history on this device. */
  const clearAllChatHistory = useCallback(async () => {
    const now = Date.now();
    clearedHistoryAtRef.current = now;
    await AsyncStorage.setItem("chatHistoryClearedAt", String(now));
    messageCacheStoreRef.current = {};
    const uid = userRef.current?.dbId;
    if (uid) schedulePersistChatMessageCache(uid, {});
    setChats((prev) =>
      prev.map((c) => ({ ...c, messages: [], lastMessage: undefined, unreadCount: 0 })),
    );
  }, []);

  const updateAvatar = useCallback(async (base64: string, mimeType = "image/jpeg") => {
    const u = userRef.current;
    if (!u) return;
    if (!u.dbId) {
      const updated = { ...u, avatar: `data:${mimeType};base64,${base64}` };
      setUserState(updated);
      await AsyncStorage.setItem("videh_user", JSON.stringify(updated));
      return;
    }
    try {
      const data = await api(`/users/${u.dbId}/avatar`, {
        method: "POST",
        body: JSON.stringify({ base64, mimeType }),
      }) as { success: boolean; avatarUrl?: string };

      if (data.success && data.avatarUrl) {
        const updated = { ...u, avatar: data.avatarUrl };
        setUserState(updated);
        await AsyncStorage.setItem("videh_user", JSON.stringify(updated));
      }
    } catch {
      const updated = { ...u, avatar: `data:${mimeType};base64,${base64}` };
      setUserState(updated);
      await AsyncStorage.setItem("videh_user", JSON.stringify(updated));
    }
  }, []);

  const logout = useCallback(async () => {
    const u = userRef.current;
    if (u?.dbId) {
      try { await api(`/users/${u.dbId}/offline`, { method: "POST" }); } catch {}
    }
    setUserState(null);
    authSessionToken = null;
    setIsAuthenticated(false);
    setChats([]);
    await AsyncStorage.removeItem("videh_user");
  }, []);

  // Create or get a direct chat in DB and return its ID
  const createDirectChat = useCallback(async (otherUserId: number, otherName: string, otherAvatar?: string): Promise<string> => {
    const u = userRef.current;
    if (!u?.dbId) throw new Error("Not authenticated");

    // Check if we already have this chat locally
    const existing = chats.find((c) => !c.isGroup && c.otherUserId === otherUserId);
    if (existing) return existing.id;

    const data = await api("/chats/direct", {
      method: "POST",
      body: JSON.stringify({ userId: u.dbId, otherUserId }),
    }) as { success: boolean; chatId?: number };

    if (!data.success || !data.chatId) throw new Error("Failed to create chat");

    const realId = String(data.chatId);

    // Add or update in local state
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.id === realId);
      if (idx !== -1) return prev;
      return [{
        id: realId,
        name: otherName,
        avatar: otherAvatar,
        unreadCount: 0,
        isGroup: false,
        messages: [],
        isPinned: false,
        isMuted: false,
        otherUserId,
      }, ...prev];
    });

    return realId;
  }, [chats]);

  // Load messages for a chat from DB
  const setActiveChatId = useCallback((chatId: string | null) => {
    activeChatIdRef.current = chatId;
    setNotificationActiveChatId(chatId);
    setNotificationRuntimeState({
      chats: chats.map((c) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        lastMessage: c.lastMessage,
        isGroup: c.isGroup,
        isMuted: c.isMuted,
      })),
      activeChatId: chatId,
    });
  }, [chats]);

  useEffect(() => {
    setNotificationRuntimeState({
      chats: chats.map((c) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        lastMessage: c.lastMessage,
        isGroup: c.isGroup,
        isMuted: c.isMuted,
      })),
      activeChatId: activeChatIdRef.current,
    });
  }, [chats]);

  const loadMessagesAfterHintTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Show incoming text immediately from push/SSE before the messages API catches up (WhatsApp-style). */
  const applyIncomingMessageHint = useCallback((signal: ChatMessageSignal) => {
    const chatId = String(signal.chatId);
    const u = userRef.current;
    const serverMessageId = signal.messageId ? String(signal.messageId) : undefined;
    const text = signal.body?.trim();
    if (!serverMessageId && !text) return;

    setChats((prev) =>
      prev.map((c) => {
        if (String(c.id) !== chatId) return c;
        const msgs = c.messages ?? [];
        if (
          serverMessageId
          && msgs.some((m) => m.id === serverMessageId || m.id === `hint_${serverMessageId}`)
        ) {
          return c;
        }
        if (
          text
          && msgs.some(
            (m) => m.senderId !== "me" && m.text === text && Date.now() - m.timestamp < 30_000,
          )
        ) {
          return c;
        }
        const senderId =
          signal.senderId != null
            ? String(signal.senderId) === String(u?.dbId)
              ? "me"
              : String(signal.senderId)
            : "other";
        if (senderId === "me") return c;

        const hintMsg: Message = {
          id: serverMessageId ? `hint_${serverMessageId}` : `hint_t${Date.now()}`,
          text: text ?? "",
          timestamp: Date.now(),
          senderId,
          senderName: signal.senderName,
          type: "text",
          status: "delivered",
        };
        const merged = [...msgs, hintMsg].sort((a, b) => a.timestamp - b.timestamp);
        const preview = text ? inferChatListPreview("text", text) : c.lastMessage;
        return { ...c, messages: merged, lastMessage: preview || c.lastMessage };
      }),
    );
  }, []);

  const patchChatMessage = useCallback((chatId: string, messageId: string, patch: Partial<Message>) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id !== chatId
          ? c
          : { ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) },
      ),
    );
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const u = userRef.current;
      const data = await api(`/chats/${chatId}/messages?limit=80&userId=${u?.dbId ?? 0}`) as { success: boolean; messages: any[] };
      if (!data.success || !data.messages) return;

      const clearedAt = clearedHistoryAtRef.current;
      const rawMessages = clearedAt > 0
        ? data.messages.filter((m: any) => new Date(m.created_at).getTime() > clearedAt)
        : data.messages;

      let mergedMessages: Message[] = [];

      setChats((prev) => {
        const prevChat = prev.find((c) => String(c.id) === String(chatId));
        const prevById = new Map((prevChat?.messages ?? []).map((pm) => [pm.id, pm]));

        const msgs: Message[] = rawMessages.map((m: any) => {
          const prevLocal = prevById.get(String(m.id));
          return mapServerRowToMessage(m, u?.dbId, prevLocal);
        });

        return prev.map((c) => {
          if (String(c.id) !== String(chatId)) return c;
          const prevMsgs = c.messages ?? [];
          const prevStable = prevMsgs.filter((m) => !m.id.startsWith("hint_"));
          const hasPendingHints = prevMsgs.some((m) => m.id.startsWith("hint_"));
          if (
            !hasPendingHints
            && prevStable.length === msgs.length
            && prevStable.every((m, i) => {
              const n = msgs[i];
              return m.id === n.id
                && m.text === n.text
                && m.status === n.status
                && m.type === n.type
                && m.mediaUrl === n.mediaUrl
                && (m.reactions?.length ?? 0) === (n.reactions?.length ?? 0);
            })
          ) {
            return c;
          }
          const isSupersededTemp = (tmp: Message, serverMsgs: Message[]) =>
            serverMsgs.some(
              (s) =>
                s.senderId === "me"
                && Math.abs(s.timestamp - tmp.timestamp) < 120_000
                && (s.text === tmp.text || (tmp.type !== "text" && s.type === tmp.type)),
            );
          const pendingLocal = prevMsgs.filter((m) => {
            if (m.id.startsWith("hint_")) {
              const hintedServerId = m.id.startsWith("hint_t") ? null : m.id.slice(5);
              if (hintedServerId && msgs.some((s) => s.id === hintedServerId)) return false;
              if (
                m.text.trim()
                && msgs.some(
                  (s) =>
                    s.senderId !== "me"
                    && (s.text === m.text || (hintedServerId != null && s.id === hintedServerId)),
                )
              ) {
                return false;
              }
              if (!m.text.trim() && hintedServerId && msgs.some((s) => s.id === hintedServerId)) {
                return false;
              }
              return true;
            }
            if (!m.id.startsWith("tmp_")) return false;
            if (
              m.type === "document"
              && typeof m.uploadProgress === "number"
              && m.uploadProgress < 100
              && !m.uploadFailed
            ) {
              return true;
            }
            return !isSupersededTemp(m, msgs);
          });
          const merged = [...msgs];
          for (const p of pendingLocal) {
            if (!merged.some((m) => m.id === p.id)) merged.push(p);
          }
          merged.sort((a, b) => a.timestamp - b.timestamp);
          mergedMessages = merged;
          return { ...c, messages: merged };
        });
      });

      const settings = await loadChatMediaSettings().catch(() => null);
      if (settings && Platform.OS !== "web") {
        for (const m of mergedMessages) {
          if (!m.mediaUrl || m.senderId === "me" || m.isViewOnce) continue;
          if (m.type === "video" && (await shouldAutoDownload("video", settings))) {
            void cacheChatVideoUrl(m.mediaUrl, authSessionToken).catch(() => {});
          }
          if (m.type === "image" && (await shouldAutoDownload("image", settings))) {
            void cacheChatImageUrl(m.mediaUrl, authSessionToken).catch(() => {});
          }
          if (
            m.type === "document"
            && (await shouldAutoDownload("document", settings))
            && !m.localMediaUri
            && typeof m.downloadProgress !== "number"
          ) {
            const msgId = m.id;
            const mediaUrl = m.mediaUrl;
            const filename = m.text;
            void (async () => {
              patchChatMessage(chatId, msgId, { downloadProgress: 0 });
              try {
                const { cacheChatDocument } = await import("@/lib/openChatDocument");
                const localUri = await cacheChatDocument({
                  mediaUrl,
                  filename,
                  sessionToken: authSessionToken,
                  onProgress: (pct) => patchChatMessage(chatId, msgId, { downloadProgress: pct }),
                });
                const info = await FileSystem.getInfoAsync(localUri);
                const cachedSize = info.exists && "size" in info ? (info.size ?? undefined) : undefined;
                patchChatMessage(chatId, msgId, {
                  localMediaUri: localUri,
                  fileSizeBytes: cachedSize,
                  downloadProgress: undefined,
                });
              } catch {
                patchChatMessage(chatId, msgId, { downloadProgress: undefined });
              }
            })();
          }
        }
      }
      const cacheUserId = userRef.current?.dbId;
      if (cacheUserId && mergedMessages.length > 0) {
        messageCacheStoreRef.current = rememberChatMessagesInStore(
          messageCacheStoreRef.current,
          chatId,
          mergedMessages as CachedChatMessage[],
        );
        schedulePersistChatMessageCache(cacheUserId, messageCacheStoreRef.current);
      }
    } catch {}
  }, [patchChatMessage]);

  loadMessagesRef.current = loadMessages;

  /** Defer API refresh so the server row exists before we merge (avoids hint flicker). */
  const scheduleLoadMessagesAfterHint = useCallback(
    (chatId: string, delayMs = 450) => {
      const key = String(chatId);
      const pending = loadMessagesAfterHintTimersRef.current.get(key);
      if (pending) clearTimeout(pending);
      const timer = setTimeout(() => {
        loadMessagesAfterHintTimersRef.current.delete(key);
        void loadMessages(chatId);
      }, delayMs);
      loadMessagesAfterHintTimersRef.current.set(key, timer);
    },
    [loadMessages],
  );

  const loadOlderMessages = useCallback(
    async (chatId: string, beforeTimestamp: number): Promise<{ loaded: number; hasMore: boolean }> => {
      const u = userRef.current;
      if (!u?.dbId || !beforeTimestamp) return { loaded: 0, hasMore: false };
      try {
        const before = new Date(beforeTimestamp).toISOString();
        const data = await api(
          `/chats/${chatId}/messages?limit=${OLDER_MESSAGES_PAGE}&before=${encodeURIComponent(before)}&userId=${u.dbId}`,
        ) as { success: boolean; messages: any[] };
        if (!data.success || !data.messages?.length) {
          return { loaded: 0, hasMore: false };
        }

        const clearedAt = clearedHistoryAtRef.current;
        const rawMessages =
          clearedAt > 0
            ? data.messages.filter((m: any) => new Date(m.created_at).getTime() > clearedAt)
            : data.messages;

        let loaded = 0;
        setChats((prev) =>
          prev.map((c) => {
            if (c.id !== chatId) return c;
            const prevById = new Map(c.messages.map((pm) => [pm.id, pm]));
            const existingIds = new Set(c.messages.map((m) => m.id));
            const older: Message[] = [];
            for (const m of rawMessages) {
              const id = String(m.id);
              if (existingIds.has(id)) continue;
              older.push(mapServerRowToMessage(m, u.dbId, prevById.get(id)));
            }
            loaded = older.length;
            if (loaded === 0) return c;
            const merged = [...older, ...c.messages].sort((a, b) => a.timestamp - b.timestamp);
            return { ...c, messages: merged };
          }),
        );
        return { loaded, hasMore: rawMessages.length >= OLDER_MESSAGES_PAGE };
      } catch {
        return { loaded: 0, hasMore: false };
      }
    },
    [],
  );

  // Auto-refresh chats, statuses and call logs (+ reload open chat on new API messages)
  useEffect(() => {
    const u = userRef.current;
    if (!u?.dbId) return;
    const runChats = () => {
      const uid = userRef.current?.dbId;
      if (!uid || refreshInFlightRef.current.chats) return;
      refreshInFlightRef.current.chats = true;
      loadChats(uid).finally(() => { refreshInFlightRef.current.chats = false; });
    };
    const runStatuses = () => {
      const uid = userRef.current?.dbId;
      if (!uid || refreshInFlightRef.current.statuses) return;
      refreshInFlightRef.current.statuses = true;
      loadStatuses(uid).finally(() => { refreshInFlightRef.current.statuses = false; });
    };
    const runCalls = () => {
      const uid = userRef.current?.dbId;
      if (!uid || refreshInFlightRef.current.calls) return;
      refreshInFlightRef.current.calls = true;
      loadCallLogs(uid).finally(() => { refreshInFlightRef.current.calls = false; });
    };
    const onChatEvent = (eventType: string, raw?: string) => {
      if (eventType !== "message") {
        if (eventType === "typing") {
          try {
            const parsed = JSON.parse(raw ?? "") as {
              chatId?: string | number;
              payload?: { active?: boolean; name?: string; userId?: number };
            };
            const cid = parsed.chatId != null ? String(parsed.chatId) : null;
            const name = parsed.payload?.name?.trim();
            if (!cid || !name) return;
            const myId = userRef.current?.dbId;
            if (myId != null && Number(parsed.payload?.userId) === myId) return;
            setTypingByChatId((prev) => {
              const list = [...(prev[cid] ?? [])];
              if (parsed.payload?.active === false) {
                const next = list.filter((n) => n !== name);
                if (next.length === 0) {
                  const { [cid]: _, ...rest } = prev;
                  return rest;
                }
                return { ...prev, [cid]: next };
              }
              if (list.includes(name)) return prev;
              return { ...prev, [cid]: [...list, name] };
            });
          } catch {
            /* ignore */
          }
        } else if (eventType === "call") {
          runCalls();
          try {
            const parsed = JSON.parse(raw ?? "") as { payload?: unknown };
            const { emitCallSignal } = require("@/lib/callEvents") as typeof import("@/lib/callEvents");
            emitCallSignal((parsed.payload ?? parsed) as any);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      runChats();
      try {
        if (!raw) return;
        const parsed = JSON.parse(raw) as {
          chatId?: string | number;
          payload?: {
            messageId?: string | number;
            content?: string;
            senderId?: string | number;
            senderName?: string;
          };
        };
        const cid = parsed.chatId != null ? String(parsed.chatId) : null;
        const messageId =
          parsed.payload?.messageId != null ? String(parsed.payload.messageId) : undefined;
        const body = parsed.payload?.content?.trim();
        const senderName = parsed.payload?.senderName?.trim();
        const senderId =
          parsed.payload?.senderId != null ? String(parsed.payload.senderId) : undefined;
        if (cid) {
          const signal: ChatMessageSignal = { chatId: cid, messageId, body, senderName, senderId };
          applyIncomingMessageHint(signal);
          emitChatMessageSignal(signal);
          if (activeChatIdRef.current === cid) {
            scheduleLoadMessagesAfterHint(cid);
          }
        }
        if (cid) {
          const uid = userRef.current?.dbId;
          void deliverPremiumChatMessageNotification({
            chatId: cid,
            messageId,
            body,
            senderName,
            reloadChats: uid
              ? async () => {
                  await loadChats(uid);
                }
              : undefined,
          }).then((delivered) => {
            agentDebugLog(
              "AppContext.tsx:onChatEvent",
              "SSE message event",
              {
                chatId: cid,
                messageId,
                appState: AppState.currentState,
                activeChatId: activeChatIdRef.current,
                deliveredPremiumNotify: delivered,
              },
              "H1",
              "post-fix",
            );
          });
        }
      } catch {
        /* ignore malformed SSE payload */
      }
    };
    const detachStream = connectChatEventStream(u.dbId, authSessionToken, onChatEvent);
    const chatTimer = setInterval(runChats, 5000);
    /** Backup poll when SSE reconnects or on flaky networks. */
    const activeChatMsgTimer = setInterval(() => {
      const cid = activeChatIdRef.current;
      if (!cid) return;
      void loadMessages(cid);
    }, 800);
    const statusTimer = setInterval(runStatuses, 12000);
    const callTimer = setInterval(runCalls, 30000);
    return () => {
      detachStream();
      clearInterval(chatTimer);
      clearInterval(activeChatMsgTimer);
      clearInterval(statusTimer);
      clearInterval(callTimer);
    };
  }, [isAuthenticated, loadChats, loadMessages, applyIncomingMessageHint, scheduleLoadMessagesAfterHint]);

  useEffect(() => {
    if (!isAuthenticated) return;
    return onChatMessageSignal((signal) => {
      applyIncomingMessageHint(signal);
      const cid = activeChatIdRef.current;
      if (cid && String(signal.chatId) === cid) {
        scheduleLoadMessagesAfterHint(cid);
      }
    });
  }, [isAuthenticated, applyIncomingMessageHint, scheduleLoadMessagesAfterHint]);

  const sendMessage = useCallback((
    chatId: string,
    text: string,
    replyToId?: string,
    replyQuote?: { replyText: string; replySenderName?: string; replyQuotedSenderId?: string; replyType?: string },
  ) => {
    if (!text.trim()) return;
    const u = userRef.current;
    const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newMsg: Message = {
      id: tempId,
      text,
      timestamp: Date.now(),
      senderId: "me",
      type: "text",
      status: "sent",
      replyToId,
      replyText: replyQuote?.replyText,
      replySenderName: replyQuote?.replySenderName,
      replyQuotedSenderId: replyQuote?.replyQuotedSenderId,
      replyType: replyQuote?.replyType,
    };
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, newMsg], lastMessage: text, lastMessageTime: Date.now() }
          : c
      )
    );

    if (u?.dbId) {
      void (async () => {
        const res = await fetch(`${BASE_URL}/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            senderId: u.dbId,
            content: text,
            type: "text",
            replyToId: replyToId && !replyToId.startsWith("tmp_") ? Number(replyToId) : undefined,
          }),
        });
        const data = (await res.json()) as {
          success?: boolean;
          message?: { id: number } | string;
          code?: string;
        };
        if (res.status === 403) {
          const msg = typeof data.message === "string" ? data.message : "You are not allowed to send messages in this chat.";
          Alert.alert("Cannot send message", msg);
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c,
            ),
          );
          return;
        }
        if (data?.success && data.message && typeof data.message === "object" && "id" in data.message) {
          const mid = data.message.id;
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? { ...c, messages: c.messages.map((m) => m.id === tempId ? { ...m, id: String(mid), status: "delivered" } : m) }
                : c,
            ),
          );
        }
      })().catch(() => {});
    }
  }, []);

  const markAsRead = useCallback((chatId: string) => {
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c));
    const u = userRef.current;
    if (u?.dbId) {
      api(`/chats/${chatId}/read`, {
        method: "POST",
        body: JSON.stringify({ userId: u.dbId }),
      }).catch(() => {});
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setChats((prev) => prev.map((c) => ({ ...c, unreadCount: 0 })));
    const u = userRef.current;
    if (!u?.dbId) return;
    try {
      await api("/chats/read-all", {
        method: "POST",
        body: JSON.stringify({ userId: u.dbId }),
      });
    } catch {
      if (u.dbId) await loadChats(u.dbId);
    }
  }, [loadChats]);

  // Send image/video message in chat
  const sendImageMessage = useCallback((chatId: string, mediaUri: string, caption?: string, isViewOnce?: boolean, mediaKind?: "image" | "video") => {
    void (async () => {
    const u = userRef.current;
    const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const isVideo = mediaKind
      ? mediaKind === "video"
      : mediaUri.match(/\.(mp4|mov|avi|mkv|webm)$/i) !== null || mediaUri.startsWith("data:video");
    const shareableMediaUri = await toShareableMediaUri(
      mediaUri,
      isVideo ? "video/mp4" : "image/jpeg",
    );
    const text = caption?.trim() || (isViewOnce ? "🔁 View once" : isVideo ? "🎥 Video" : "📷 Photo");
    const msgType: Message["type"] = isVideo ? "video" : "image";
    const newMsg: Message = {
      id: tempId, text, timestamp: Date.now(), senderId: "me",
      type: msgType, status: "sent", mediaUrl: shareableMediaUri, isViewOnce,
    };
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, newMsg], lastMessage: text, lastMessageTime: Date.now() }
          : c
      )
    );
    if (u?.dbId) {
      const res = await fetch(`${BASE_URL}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          senderId: u.dbId,
          content: text,
          type: msgType,
          mediaUrl: shareableMediaUri,
          isViewOnce: isViewOnce ?? false,
        }),
      });
      const data = (await res.json()) as { success?: boolean; message?: { id: number } | string };
      if (res.status === 403) {
        const msg = typeof data.message === "string" ? data.message : "You are not allowed to send messages in this chat.";
        Alert.alert("Cannot send message", msg);
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c)),
        );
        return;
      }
      if (data?.success && data.message && typeof data.message === "object" && "id" in data.message) {
        const mid = data.message.id;
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.map((m) => m.id === tempId ? { ...m, id: String(mid), status: "delivered", mediaUrl: shareableMediaUri } : m) }
              : c,
          ),
        );
      }
    }
    })();
  }, [toShareableMediaUri]);

  const sendPreparedMediaMessage = useCallback((
    chatId: string,
    opts: { mediaUrl: string; kind: "image" | "video"; caption?: string; isViewOnce?: boolean },
  ) => {
    void (async () => {
      const u = userRef.current;
      const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const isVideo = opts.kind === "video";
      const text = opts.caption?.trim() || (opts.isViewOnce ? "🔁 View once" : isVideo ? "🎥 Video" : "📷 Photo");
      const msgType: Message["type"] = isVideo ? "video" : "image";
      const newMsg: Message = {
        id: tempId, text, timestamp: Date.now(), senderId: "me",
        type: msgType, status: "sent", mediaUrl: opts.mediaUrl, isViewOnce: opts.isViewOnce,
      };
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, messages: [...c.messages, newMsg], lastMessage: text, lastMessageTime: Date.now() }
            : c
        )
      );
      if (!u?.dbId) return;
      const res = await fetch(`${BASE_URL}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          senderId: u.dbId,
          content: text,
          type: msgType,
          mediaUrl: opts.mediaUrl,
          isViewOnce: opts.isViewOnce ?? false,
        }),
      });
      const data = (await res.json()) as { success?: boolean; message?: { id: number } | string };
      if (res.status === 403) {
        Alert.alert("Cannot send message", typeof data.message === "string" ? data.message : "Not allowed.");
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c)),
        );
        return;
      }
      if (data?.success && data.message && typeof data.message === "object" && "id" in data.message) {
        const mid = data.message.id;
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.map((m) => m.id === tempId ? { ...m, id: String(mid), status: "delivered" } : m) }
              : c,
          ),
        );
      }
    })();
  }, []);

  const consumeViewOnceMessage = useCallback(async (chatId: string, messageId: string): Promise<string | null> => {
    const u = userRef.current;
    if (!u?.dbId || messageId.startsWith("tmp_")) return null;
    const res = await fetch(`${BASE_URL}/api/chats/${chatId}/messages/${messageId}/consume-view-once`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ userId: u.dbId }),
    });
    const data = (await res.json()) as { success?: boolean; mediaUrl?: string | null; message?: string };
    if (!res.ok || !data.success) {
      throw new Error(data.message ?? "Could not open message");
    }
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, viewOnceOpened: true, mediaUrl: undefined } : m,
              ),
            }
          : c,
      ),
    );
    await loadMessages(chatId);
    return data.mediaUrl ?? null;
  }, [loadMessages]);

  // Send audio/voice message
  const sendAudioMessage = useCallback((chatId: string, audioUri: string, durationSecs: number, waveform?: number[]) => {
    void (async () => {
    const u = userRef.current;
    const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const text = encodeVoiceMessageText(durationSecs, waveform);
    const chatPreview = stripWaveformMeta(text);
    let shareableAudioUri: string;
    try {
      shareableAudioUri = await toShareableMediaUri(audioUri, "audio/mp4");
    } catch (e) {
      Alert.alert("Voice message", e instanceof Error ? e.message : "Could not upload voice note.");
      return;
    }
    const newMsg: Message = {
      id: tempId, text, timestamp: Date.now(), senderId: "me",
      type: "audio", status: "sent", mediaUrl: shareableAudioUri,
    };
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: [...c.messages, newMsg], lastMessage: chatPreview, lastMessageTime: Date.now() }
          : c
      )
    );
    if (u?.dbId) {
      const res = await fetch(`${BASE_URL}/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ senderId: u.dbId, content: text, type: "audio", mediaUrl: shareableAudioUri }),
      });
      const data = (await res.json()) as { success?: boolean; message?: { id: number } | string };
      if (res.status === 403) {
        const msg = typeof data.message === "string" ? data.message : "You are not allowed to send messages in this chat.";
        Alert.alert("Cannot send message", msg);
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c)),
        );
        return;
      }
      if (data?.success && data.message && typeof data.message === "object" && "id" in data.message) {
        const mid = data.message.id;
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.map((m) => m.id === tempId ? { ...m, id: String(mid), status: "delivered", mediaUrl: shareableAudioUri } : m) }
              : c,
          ),
        );
      }
    }
    })();
  }, [toShareableMediaUri]);

  const sendDocumentMessage = useCallback((
    chatId: string,
    localUri: string,
    filename: string,
    fileSizeBytes: number,
    mimeType: string,
  ) => {
    void (async () => {
      const u = userRef.current;
      const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const displayName = filename.trim() || "Document";
      let stableLocalUri: string;
      try {
        stableLocalUri = await ensureUploadableFileUri(localUri, displayName);
      } catch (e) {
        Alert.alert("Couldn't send document", e instanceof Error ? e.message : "Could not read file.");
        return;
      }
      const patchMsg = (patch: Partial<Message>) => {
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.map((m) => (m.id === tempId ? { ...m, ...patch } : m)) }
              : c,
          ),
        );
      };

      const newMsg: Message = {
        id: tempId,
        text: displayName,
        timestamp: Date.now(),
        senderId: "me",
        type: "document",
        status: "sent",
        mediaUrl: stableLocalUri,
        localMediaUri: stableLocalUri,
        fileSizeBytes,
        uploadProgress: 0,
        uploadFailed: false,
      };
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, messages: [...c.messages, newMsg], lastMessage: displayName, lastMessageTime: Date.now() }
            : c,
        ),
      );

      if (!u?.dbId) return;

      try {
        const upload = await uploadChatMediaWithProgress({
          uri: stableLocalUri,
          mime: mimeType,
          filename: displayName,
          sessionToken: u.sessionToken,
          onProgress: (p) => patchMsg({ uploadProgress: p.percent }),
        });
        patchMsg({
          uploadProgress: 100,
          mediaUrl: upload.url,
          localMediaUri: stableLocalUri,
          fileSizeBytes: upload.size || fileSizeBytes,
        });

        const res = await fetch(`${BASE_URL}/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            senderId: u.dbId,
            content: displayName,
            type: "document",
            mediaUrl: upload.url,
          }),
        });
        const data = (await res.json()) as { success?: boolean; message?: { id: number } | string };
        if (res.status === 403) {
          const msg = typeof data.message === "string" ? data.message : "You are not allowed to send messages in this chat.";
          Alert.alert("Cannot send message", msg);
          setChats((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c)),
          );
          return;
        }
        if (data?.success && data.message && typeof data.message === "object" && "id" in data.message) {
          const mid = data.message.id;
          patchMsg({
            id: String(mid),
            status: "delivered",
            mediaUrl: upload.url,
            localMediaUri: stableLocalUri,
            uploadProgress: undefined,
            uploadFailed: false,
          });
        } else {
          patchMsg({ uploadProgress: undefined, uploadFailed: false });
        }
      } catch (e) {
        patchMsg({ uploadProgress: undefined, uploadFailed: true });
        Alert.alert("Couldn't send document", e instanceof Error ? e.message : "Please try again.");
      }
    })();
  }, []);

  const sendContactMessage = useCallback((
    chatId: string,
    contact: { name: string; phones: string[]; emails?: string[] },
  ) => {
    void (async () => {
      const u = userRef.current;
      const { encodeContactMessage, contactChatPreview } = await import("@/lib/contactMessage");
      const content = encodeContactMessage(contact);
      const preview = contactChatPreview(content);
      const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const newMsg: Message = {
        id: tempId,
        text: content,
        timestamp: Date.now(),
        senderId: "me",
        type: "contact",
        status: "sent",
      };
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, messages: [...c.messages, newMsg], lastMessage: preview, lastMessageTime: Date.now() }
            : c,
        ),
      );

      if (!u?.dbId) return;

      try {
        const res = await fetch(`${BASE_URL}/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ senderId: u.dbId, content, type: "contact" }),
        });
        const data = (await res.json()) as { success?: boolean; message?: { id: number } | string };
        if (res.status === 403) {
          const msg = typeof data.message === "string" ? data.message : "You are not allowed to send messages in this chat.";
          Alert.alert("Cannot send message", msg);
          setChats((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c)),
          );
          return;
        }
        if (data?.success && data.message && typeof data.message === "object" && "id" in data.message) {
          const mid = data.message.id;
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === tempId ? { ...m, id: String(mid), status: "delivered" } : m,
                    ),
                  }
                : c,
            ),
          );
        }
      } catch {
        setChats((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c)),
        );
        Alert.alert("Error", "Could not send this contact. Please try again.");
      }
    })();
  }, []);

  // Delete for everyone
  const deleteForEveryone = useCallback((chatId: string, messageId: string) => {
    const u = userRef.current;
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const messages = c.messages.map((m) =>
          m.id === messageId
            ? { ...m, type: "deleted" as const, text: "This message was deleted", mediaUrl: undefined }
            : m,
        );
        const last = [...messages].reverse().find((m) => m.type !== "deleted");
        return {
          ...c,
          messages,
          lastMessage: messagePreviewText(last),
          lastMessageTime: last?.timestamp,
        };
      }),
    );
    const dbId = u?.dbId;
    if (dbId) {
      void (async () => {
        try {
          await api(`/chats/${chatId}/messages/${messageId}`, {
            method: "DELETE",
            body: JSON.stringify({ userId: dbId, deleteForEveryone: true }),
          });
          await loadChats(dbId);
          if (activeChatIdRef.current === chatId) await loadMessages(chatId);
        } catch {
          /* keep optimistic UI */
        }
      })();
    }
  }, [loadChats, loadMessages]);

  // Edit message
  const editMessage = useCallback((chatId: string, messageId: string, newText: string) => {
    const u = userRef.current;
    if (!newText.trim()) return;
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: c.messages.map((m) =>
              m.id === messageId ? { ...m, text: newText.trim(), isEdited: true, editedAt: Date.now() } : m
            )}
          : c
      )
    );
    if (u?.dbId) {
      api(`/chats/${chatId}/messages/${messageId}`, {
        method: "PUT",
        body: JSON.stringify({ userId: u.dbId, content: newText.trim() }),
      }).catch(() => {});
    }
  }, []);

  // React to message
  const reactToMessage = useCallback((chatId: string, messageId: string, emoji: string) => {
    const u = userRef.current;
    if (!u?.dbId) return;
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        return {
          ...c, messages: c.messages.map((m) => {
            if (m.id !== messageId) return m;
            const existing = m.reactions?.find((r) => r.userId === u.dbId);
            let newReactions: typeof m.reactions;
            if (existing?.emoji === emoji) {
              newReactions = (m.reactions ?? []).filter((r) => r.userId !== u.dbId);
            } else {
              newReactions = [...(m.reactions ?? []).filter((r) => r.userId !== u.dbId), { emoji, userId: u.dbId! }];
            }
            return { ...m, reactions: newReactions };
          }),
        };
      })
    );
    api(`/chats/${chatId}/messages/${messageId}/react`, {
      method: "POST",
      body: JSON.stringify({ userId: u.dbId, emoji }),
    }).catch(() => {});
  }, []);

  // Typing indicator
  const setTyping = useCallback((chatId: string) => {
    const u = userRef.current;
    if (!u?.dbId) return;
    void fetch(`${BASE_URL}/api/chats/${chatId}/typing`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ userId: u.dbId }),
    }).catch(() => {});
  }, []);

  const clearTyping = useCallback((chatId: string) => {
    const u = userRef.current;
    if (!u?.dbId) return;
    void fetch(`${BASE_URL}/api/chats/${chatId}/typing`, {
      method: "DELETE",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ userId: u.dbId }),
    }).catch(() => {});
  }, []);

  const reportRemoteTyping = useCallback((chatId: string, names: string[]) => {
    const key = String(chatId);
    setTypingByChatId((prev) => {
      if (names.length === 0) {
        if (!(key in prev)) return prev;
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      const cur = prev[key] ?? [];
      if (cur.length === names.length && cur.every((n, i) => n === names[i])) return prev;
      return { ...prev, [key]: names };
    });
  }, []);

  const createGroup = useCallback((name: string, memberIds: number[], groupAvatarUrl?: string) => {
    const u = userRef.current;
    if (!u?.dbId) return;
    api("/chats/group", {
      method: "POST",
      body: JSON.stringify({ creatorId: u.dbId, name, memberIds, groupAvatarUrl: groupAvatarUrl ?? null }),
    }).then((data: any) => {
      if (data?.success && data.chatId) {
        setChats((prev) => [{
          id: String(data.chatId), name, unreadCount: 0, isGroup: true,
          members: memberIds.map(String), messages: [], isPinned: false, isMuted: false,
          avatar: groupAvatarUrl ?? undefined,
        }, ...prev]);
      }
    }).catch(() => {});
  }, []);

  const addStatus = useCallback(async (content: string, type: "text" | "image" | "video", bg?: string, mediaUrl?: string, videoDurationMs?: number | null, editorData?: StoryEditorData) => {
    const u = userRef.current;
    if (!u) return;
    const tempId = Date.now().toString();
    const newStatus: Status = {
      id: tempId, userId: "me", userName: u.name,
      userAvatar: u.avatar,
      content, type, mediaUrl, timestamp: Date.now(), expiresAt: Date.now() + STATUS_LIFETIME_MS, viewed: false,
      editorData,
      backgroundColor: bg ?? "#00A884",
    };
    setStatuses((prev) => [newStatus, ...prev].filter(isStatusActive));

    if (u.dbId) {
      try {
        const uploadedMediaUrl = mediaUrl
          ? await uploadStatusMedia(mediaUrl, type === "video" ? "video/mp4" : "image/jpeg")
          : null;
        const uploadedEditorData = editorData
          ? {
              ...editorData,
              musicUri: editorData.musicUri
                ? await uploadStatusMedia(editorData.musicUri, "audio/mpeg")
                : undefined,
            }
          : null;
        const res = await fetch(`${BASE_URL}/api/statuses`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            userId: u.dbId,
            content,
            type,
            backgroundColor: bg ?? "#00A884",
            mediaUrl: uploadedMediaUrl,
            videoDurationMs: type === "video" ? videoDurationMs ?? null : undefined,
            editorData: uploadedEditorData,
          }),
        });
        const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string };
        if (!res.ok || !data.success) {
          throw new Error(data.message ?? "Could not publish story.");
        }
        await loadStatuses(u.dbId);
      } catch (err) {
        setStatuses((prev) => prev.filter((s) => s.id !== tempId));
        throw err;
      }
    }
  }, [loadStatuses, uploadStatusMedia]);

  const markStatusViewedLocally = useCallback((statusId: string) => {
    setStatuses((prev) =>
      prev.map((status) =>
        status.id === statusId && status.userId !== "me"
          ? { ...status, viewed: true }
          : status
      )
    );
  }, []);

  const deleteStatus = useCallback(async (statusId: string) => {
    const uid = userRef.current?.dbId;
    if (!uid) return;
    setStatuses((prev) => prev.filter((s) => s.id !== statusId));
    await api(`/statuses/${statusId}`, {
      method: "DELETE",
      body: JSON.stringify({ userId: uid }),
    }).catch(() => {});
    await loadStatuses(uid);
  }, [loadStatuses]);

  const deleteMessage = useCallback((chatId: string, messageId: string) => {
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const remaining = c.messages.filter((m) => m.id !== messageId);
        const last = [...remaining].reverse().find((m) => m.type !== "deleted");
        return {
          ...c,
          messages: remaining,
          lastMessage: messagePreviewText(last),
          lastMessageTime: last?.timestamp,
        };
      }),
    );
    const u = userRef.current;
    const dbId = u?.dbId;
    if (dbId) {
      void (async () => {
        try {
          await api(`/chats/${chatId}/messages/${messageId}`, {
            method: "DELETE",
            body: JSON.stringify({ userId: dbId }),
          });
          await loadChats(dbId);
          if (activeChatIdRef.current === chatId) await loadMessages(chatId);
        } catch {
          /* keep optimistic UI */
        }
      })();
    }
  }, [loadChats, loadMessages]);

  const pinChat = useCallback((chatId: string) => {
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, isPinned: !c.isPinned } : c));
  }, []);

  const muteChat = useCallback((chatId: string) => {
    let nextMuted = false;
    setChats((prev) => prev.map((c) => {
      if (c.id !== chatId) return c;
      nextMuted = !c.isMuted;
      return { ...c, isMuted: nextMuted };
    }));
    const u = userRef.current;
    if (u?.dbId) {
      api(`/chats/${chatId}/mute`, {
        method: "PATCH",
        body: JSON.stringify({ userId: u.dbId, muted: nextMuted }),
      }).catch(() => {});
    }
  }, []);

  const archiveChat = useCallback((chatId: string, archived = true) => {
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, isArchived: archived } : c));
    const u = userRef.current;
    if (u?.dbId) {
      api(`/chats/${chatId}/archive`, {
        method: "PATCH",
        body: JSON.stringify({ userId: u.dbId, archived }),
      }).catch(() => {});
    }
  }, []);

  const starMessage = useCallback((chatId: string, messageId: string) => {
    const u = userRef.current;
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId
                  ? { ...m, isStarred: !m.isStarred, chatId, chatName: c.name }
                  : m
              ),
            }
          : c
      )
    );
    if (u?.dbId) {
      api(`/chats/${chatId}/messages/${messageId}/star`, {
        method: "POST",
        body: JSON.stringify({ userId: u.dbId }),
      }).catch(() => {});
    }
  }, []);

  const forwardMessage = useCallback((chatId: string, messageId: string, targetChatId: string) => {
    const u = userRef.current;
    const sourceChat = chats.find((c) => c.id === chatId);
    const msg = sourceChat?.messages.find((m) => m.id === messageId);
    if (!msg || !targetChatId || !u?.dbId || targetChatId === chatId) return;
    if (msg.type === "deleted" || msg.isViewOnce) {
      Alert.alert("Cannot forward", "This message cannot be forwarded inside Videh.");
      return;
    }
    const newForwardCount = (msg.forwardCount ?? 0) + 1;
    const tempId = "tmp_fwd_" + Date.now().toString();
    const preview = msg.type === "image" ? "Photo" : msg.type === "video" ? "Video" : msg.text;
    const fwdMsg: Message = {
      id: tempId, text: msg.text, timestamp: Date.now(), senderId: "me",
      type: msg.type, status: "sent", mediaUrl: msg.mediaUrl,
      isForwarded: true, forwardCount: newForwardCount,
    };
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId
          ? { ...c, messages: [...c.messages, fwdMsg], lastMessage: preview, lastMessageTime: Date.now() }
          : c
      )
    );
    void (async () => {
      const res = await fetch(`${BASE_URL}/api/chats/${chatId}/messages/${messageId}/forward`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          senderId: u.dbId,
          targetChatId: Number(targetChatId) || targetChatId,
        }),
      });
      const data = (await res.json()) as { success?: boolean; message?: { id: number } | string };
      if (!res.ok || !data.success) {
        const msg403 = typeof data.message === "string"
          ? data.message
          : "Could not forward. Choose a Videh chat you can message.";
        Alert.alert("Cannot forward", msg403);
        setChats((prev) =>
          prev.map((c) =>
            c.id === targetChatId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c,
          ),
        );
        return;
      }
      if (data.message && typeof data.message === "object" && "id" in data.message) {
        const mid = data.message.id;
        setChats((prev) =>
          prev.map((c) =>
            c.id === targetChatId
              ? { ...c, messages: c.messages.map((m) => m.id === tempId ? { ...m, id: String(mid), status: "delivered" } : m) }
              : c,
          ),
        );
      }
    })().catch(() => {
      Alert.alert("Cannot forward", "Network error. Message was not forwarded.");
    });
  }, [chats]);

  const starredMessages = chats.flatMap((c) => c.messages.filter((m) => m.isStarred));

  const blockUser = useCallback(async (otherUserId: number) => {
    const uid = userRef.current?.dbId;
    if (!uid) return;
    await api(`/users/${otherUserId}/block`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockerId: uid }),
    }).catch(() => {});
  }, []);

  const unblockUser = useCallback(async (otherUserId: number) => {
    const uid = userRef.current?.dbId;
    if (!uid) return;
    await api(`/users/${otherUserId}/block`, {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockerId: uid }),
    }).catch(() => {});
  }, []);

  const reportUser = useCallback(async (otherUserId: number, args?: { chatId?: string; reason?: string; details?: string; block?: boolean }) => {
    const uid = userRef.current?.dbId;
    if (!uid) return;
    await api(`/users/${otherUserId}/report`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reporterId: uid,
        chatId: args?.chatId ? Number(args.chatId) : undefined,
        reason: args?.reason ?? "reported_by_user",
        details: args?.details,
        block: args?.block ?? false,
      }),
    }).catch(() => {});
  }, []);

  const setChatDisappear = useCallback(async (chatId: string, seconds: number | null) => {
    await api(`/chats/${chatId}/disappear`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seconds }),
    }).catch(() => {});
  }, []);

  const [liveLocationSession, setLiveLocationSession] = useState<{
    chatId: string;
    messageId: string;
    untilMs: number;
    comment?: string;
  } | null>(null);
  const liveTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopLiveLocationSession = useCallback(() => {
    setLiveLocationSession(null);
    if (liveTickRef.current) {
      clearInterval(liveTickRef.current);
      liveTickRef.current = null;
    }
  }, []);

  const startLiveLocationSession = useCallback((args: { chatId: string; messageId: string; untilMs: number; comment?: string }) => {
    setLiveLocationSession(args);
  }, []);

  const updateLocationOnServer = useCallback(async (chatId: string, messageId: string, body: { content?: string; mediaUrl?: string }) => {
    const u = userRef.current;
    if (!u?.dbId) return;
    await fetch(`${BASE_URL}/api/chats/${chatId}/messages/${messageId}`, {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ userId: u.dbId, ...body }),
    }).catch(() => {});
    await loadMessages(chatId);
  }, [loadMessages]);

  useEffect(() => {
    if (!liveLocationSession) return;
    const sess = { ...liveLocationSession };
    const tick = async () => {
      if (liveLocationTickingRef.current) return;
      if (Date.now() > sess.untilMs) {
        if (liveTickRef.current) {
          clearInterval(liveTickRef.current);
          liveTickRef.current = null;
        }
        setLiveLocationSession(null);
        return;
      }
      const u = userRef.current;
      if (!u?.dbId) return;
      liveLocationTickingRef.current = true;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude } = loc.coords;
        const content = encodeLocationPayload({
          v: 1,
          mode: "live",
          lat: latitude,
          lng: longitude,
          until: sess.untilMs,
          comment: sess.comment,
          stopped: false,
        });
        await fetch(`${BASE_URL}/api/chats/${sess.chatId}/messages/${sess.messageId}`, {
          method: "PUT",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            userId: u.dbId,
            content,
            mediaUrl: buildMapsUrl(latitude, longitude),
          }),
        }).catch(() => {});
        await loadMessages(sess.chatId);
      } catch {
        /* ignore */
      } finally {
        liveLocationTickingRef.current = false;
      }
    };
    void tick();
    liveTickRef.current = setInterval(() => {
      void tick();
    }, 12000);
    return () => {
      if (liveTickRef.current) {
        clearInterval(liveTickRef.current);
        liveTickRef.current = null;
      }
    };
  }, [liveLocationSession, loadMessages]);

  const refreshCallLogs = useCallback(async () => {
    const uid = userRef.current?.dbId;
    if (!uid) return;
    await loadCallLogs(uid);
  }, [loadCallLogs]);

  return (
    <AppContext.Provider value={{
      user, isAuthenticated, isInitialized, chats, statuses, contacts, callLogs,
      setUser, logout, sendMessage, createGroup, markAsRead, markAllAsRead,
      addStatus, deleteMessage, pinChat, muteChat, archiveChat,
      starMessage, forwardMessage, starredMessages, updateAvatar,
      createDirectChat, loadMessages, applyIncomingMessageHint, loadOlderMessages, refreshChats, clearAllChatHistory,
      sendImageMessage, sendPreparedMediaMessage, consumeViewOnceMessage, sendAudioMessage, sendDocumentMessage,
      sendContactMessage, setTyping, clearTyping,
      deleteForEveryone, editMessage, reactToMessage, markStatusViewedLocally, deleteStatus,
      blockUser, unblockUser, reportUser, setChatDisappear,
      updateLocationOnServer, startLiveLocationSession, stopLiveLocationSession,
      setActiveChatId, refreshCallLogs, typingByChatId, reportRemoteTyping, patchChatMessage,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
