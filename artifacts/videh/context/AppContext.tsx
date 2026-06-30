import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Alert, AppState, Platform, type AppStateStatus } from "react-native";
import { agentDebugLog } from "@/lib/agentDebugLog";
import { albumSendLog } from "@/lib/albumSendLog";
import { connectChatEventStream } from "@/lib/connectChatEventStream";
import {
  ACTIVE_CHAT_MESSAGE_BACKUP_POLL_MS,
  FOREGROUND_CHAT_LIST_POLL_MS,
  MESSAGE_HINT_API_DELAY_MS,
  MESSAGE_HINT_API_RETRY_MS,
  MESSAGE_HINT_MEDIA_RETRY_MS,
  TEXT_OUTBOX_RETRY_MS,
} from "@/lib/chatRealtimePoll";
import { enqueueChatTextSend } from "@/lib/chatTextSendQueue";
import { emitChatMessageSignal, onChatMessageSignal, type ChatMessageSignal } from "@/lib/chatMessageEvents";
import {
  deliverPremiumChatMessageNotification,
  getNotificationActiveChatId,
  setNotificationActiveChatId,
  setNotificationRuntimeState,
} from "@/lib/incomingMessageNotify";
import * as Location from "expo-location";
import { getApiUrl } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { registerPushTokenWithServer } from "@/lib/pushNotifications";
import { encodeLocationPayload, mapsUrl as buildMapsUrl } from "@/lib/locationMessage";
import { safeJsonParse } from "@/lib/safeJson";
import { loadChatMediaSettings } from "@/lib/chatMediaSettings";
import { computeClientMessageExpiresAt, isDisappearingMessageExpired } from "@/lib/disappearTimerOptions";
import { shouldAutoDownload } from "@/lib/chatMediaNetwork";
import { cacheChatImageUrl, cacheChatVideoUrl } from "@/lib/cacheChatMedia";
import { uploadChatMediaWithProgress } from "@/lib/chatMediaUpload";
import { uploadChatImagesBatch } from "@/lib/uploadChatImagesBatch";
import {
  imageExtFromUri,
  imageMimeFromUri,
  isGifUri,
  prepareImageForChatUpload,
  type MediaQuality,
} from "@/lib/imageEdit";
import { ensureUploadableFileUri } from "@/lib/prepareFileUpload";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrl";
import { encodeVoiceMessageText, stripWaveformMeta } from "@/lib/voiceWaveform";
import { messageReplyPreviewText } from "@/lib/messageReplyPreview";
import { messageFromStatusReplyMeta, type StatusReplyMeta } from "@/lib/statusReply";
import {
  albumChatPreview,
  albumMessageDisplayText,
  coerceAlbumMessageFields,
  ensureAlbumDisplayUris,
  normalizeAlbumMediaUrl,
  encodeAlbumMessageContent,
  parseAlbumMessageContent,
  parseAlbumPhotoCountLabel,
  resolveAlbumUrls,
} from "@/lib/chatAlbumMessage";
import { inferChatListPreview, normalizeMessageType } from "@/lib/normalizeMessage";
import {
  parseBusinessTemplatePayload,
  businessTemplatePreviewText,
  type BusinessTemplatePayload,
} from "@/lib/businessTemplateMessage";

function isMediaMessageType(type: Message["type"]): boolean {
  return (
    type === "album"
    || type === "image"
    || type === "video"
    || type === "audio"
    || type === "document"
    || type === "template"
  );
}
import { globalMessageRetentionCutoffMs } from "@/lib/chatMessageRetention";
import {
  collectPendingLocalMessages,
  dedupeChatMessages,
  mergeServerWithPending,
  preserveHistoricallyLoadedMessages,
  serverWindowMatchesLocalTail,
} from "@/lib/mergePendingChatMessages";
import {
  buildChatsFromCache,
  flushChatListCache,
  loadChatListCache,
  schedulePersistChatListCache,
} from "@/lib/chatListCache";
import {
  flushChatMessageCache,
  loadChatMessageCache,
  rememberChatMessagesInStore,
  schedulePersistChatMessageCache,
  type CachedChatMessage,
  type ChatMessageCacheStore,
} from "@/lib/chatMessageCache";
import {
  fetchGroupAutoTranslations,
  messagesNeedingGroupTranslation,
  resolveGroupTranslationPrefs,
  translateIncomingGroupMessages,
} from "@/lib/groupAutoTranslate";
import {
  addTextToMessageOutbox,
  loadMessageOutbox,
  mergeOutboxIntoChats,
  removeFromMessageOutbox,
  type TextOutboxEntry,
} from "@/lib/messageOutbox";
import {
  chatClearCutoff,
  filterMessagesAfterClearCutoff,
  loadChatDeletedAtMap,
  loadHiddenChatIds,
  saveChatDeletedAtMap,
  saveHiddenChatIds,
  shouldRestoreDeletedChat,
  type ChatDeletedAtMap,
} from "@/lib/chatListDelete";

const BASE_URL = getApiUrl();
const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;
let authSessionToken: string | null = null;

const getStatusExpiryTime = (status: Status) => status.expiresAt ?? status.timestamp + STATUS_LIFETIME_MS;
const isStatusActive = (status: Status) => getStatusExpiryTime(status) > Date.now();

const api = async (path: string, options?: RequestInit) => {
  const res = await fetchWithTimeout(`${BASE_URL}/api${path}`, {
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
  senderAvatar?: string;
  type: "text" | "image" | "video" | "audio" | "document" | "location" | "contact" | "deleted" | "call" | "system" | "album" | "template";
  status: "sent" | "delivered" | "read";
  mediaUrl?: string;
  /** Multiple images in one bubble (Videh album). */
  albumUrls?: string[];
  /** Local picker URIs kept until CDN/API copies are confirmed (Videh). */
  albumLocalUrls?: string[];
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
  /** Story/status this message replies to (WhatsApp-style). */
  statusReplyId?: string;
  statusReplyOwnerId?: string;
  statusReplyOwnerName?: string;
  statusReplyType?: "text" | "image" | "video";
  statusReplyMediaUrl?: string;
  statusReplyContent?: string;
  statusReplyBackgroundColor?: string;
  /** Bytes; shown on document bubbles (Videh-style). */
  fileSizeBytes?: number;
  /** 0–99 while uploading; undefined when sent. */
  uploadProgress?: number;
  uploadFailed?: boolean;
  /** 0–99 while downloading on receiver; undefined when cached. */
  downloadProgress?: number;
  /** Stable on-device copy for documents (open before/without server download). */
  localMediaUri?: string;
  /** Unix ms when this message auto-deletes (disappearing messages). */
  expiresAt?: number;
  /** User chose to keep this message past the disappear timer. */
  isKept?: boolean;
  /** WhatsApp-style business API template (image, body, footer, buttons). */
  templatePayload?: BusinessTemplatePayload;
  /** Server auto-translated text for this viewer (group chats). */
  translatedText?: string;
  translationSourceLang?: string;
  translationTargetLang?: string;
}

const OLDER_MESSAGES_PAGE = 40;

function asDeletedMessage(m: Message): Message {
  return {
    ...m,
    type: "deleted",
    text: "This message was deleted",
    mediaUrl: undefined,
    albumUrls: undefined,
    albumLocalUrls: undefined,
    localMediaUri: undefined,
    uploadProgress: undefined,
    downloadProgress: undefined,
    uploadFailed: undefined,
    fileSizeBytes: undefined,
    isViewOnce: false,
    viewOnceOpened: false,
  };
}

function mapStatusReplyFields(m: any): Partial<Message> {
  if (!m.status_reply_id) return {};
  return {
    statusReplyId: String(m.status_reply_id),
    statusReplyOwnerId: m.status_reply_owner_id != null ? String(m.status_reply_owner_id) : undefined,
    statusReplyOwnerName: m.status_reply_owner_name ?? undefined,
    statusReplyType: m.status_reply_type ?? undefined,
    statusReplyMediaUrl:
      resolvePublicAssetUrl(m.status_reply_media_url) ?? m.status_reply_media_url ?? undefined,
    statusReplyContent: m.status_reply_content ?? undefined,
    statusReplyBackgroundColor: m.status_reply_background_color ?? undefined,
  };
}

function mapServerRowToMessage(m: any, viewerDbId: number | undefined, prevLocal?: Message): Message {
  const isMe = String(m.sender_id) === String(viewerDbId);
  let status: "sent" | "delivered" | "read" = isMe ? "delivered" : "sent";
  if (isMe) {
    if (m.delivery_status === "read") status = "read";
    else if (m.delivery_status === "delivered") status = "delivered";
  }
  if (m.is_deleted) {
    return {
      id: String(m.id),
      text: "This message was deleted",
      timestamp: new Date(m.created_at).getTime(),
      senderId: isMe ? "me" : String(m.sender_id),
      senderName: m.sender_name ?? undefined,
      senderAvatar: m.sender_avatar ? resolvePublicAssetUrl(m.sender_avatar) ?? m.sender_avatar : prevLocal?.senderAvatar,
      type: "deleted",
      status,
      isStarred: m.is_starred,
      isForwarded: m.is_forwarded,
      forwardCount: m.forward_count ?? 0,
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
      expiresAt: m.expires_at ? new Date(m.expires_at).getTime() : undefined,
      isKept: m.is_kept ?? false,
    };
  }
  const content = m.content ?? "";
  const mediaUrl = m.media_url ?? undefined;
  const albumParsed = parseAlbumMessageContent(content);
  const type = normalizeMessageType(m.type, content, mediaUrl);
  const albumUrls = resolveAlbumUrls(content, {
    albumUrls: prevLocal?.albumUrls,
    mediaUrl,
  });
  const albumLocalUrls = prevLocal?.albumLocalUrls?.length
    ? prevLocal.albumLocalUrls
    : undefined;
  const resolvedType = albumUrls && albumUrls.length >= 2 ? "album" : type;
  const templatePayload =
    resolvedType === "template" ? (parseBusinessTemplatePayload(content) ?? undefined) : undefined;
  const displayText = resolvedType === "album"
    ? albumMessageDisplayText(content, albumUrls?.length ?? albumParsed?.urls.length)
    : templatePayload
      ? businessTemplatePreviewText(templatePayload)
      : content;
  return coerceAlbumMessageFields({
    id: String(m.id),
    text: displayText,
    timestamp: new Date(m.created_at).getTime(),
    senderId: isMe ? "me" : String(m.sender_id),
    senderName: m.sender_name ?? undefined,
    senderAvatar: m.sender_avatar
      ? resolvePublicAssetUrl(m.sender_avatar) ?? m.sender_avatar
      : prevLocal?.senderAvatar,
    type: resolvedType,
    status,
    mediaUrl: resolvedType === "album" ? (albumUrls?.[0] ?? mediaUrl) : mediaUrl,
    albumUrls,
    albumLocalUrls,
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
    expiresAt: m.expires_at ? new Date(m.expires_at).getTime() : prevLocal?.expiresAt,
    isKept: m.is_kept ?? prevLocal?.isKept ?? false,
    templatePayload: templatePayload ?? prevLocal?.templatePayload,
    translatedText: m.translated_content != null && String(m.translated_content).trim()
      ? String(m.translated_content)
      : undefined,
    translationSourceLang: m.translation_source_lang ?? undefined,
    translationTargetLang: m.translation_target_lang ?? undefined,
    ...mapStatusReplyFields(m),
  });
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
  isKhataNotebook?: boolean;
  /** Seconds until new messages disappear; null/undefined = off */
  disappearAfterSeconds?: number | null;
  /** Group: auto-translate incoming messages to each member's language */
  autoTranslateEnabled?: boolean;
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
  /** False until cache hydrate or first chat-list API sync (avoids empty flash on cold start). */
  chatsListReady: boolean;
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
    statusReply?: StatusReplyMeta,
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
  keepMessage: (chatId: string, messageId: string) => Promise<void>;
  forwardMessage: (chatId: string, messageId: string, targetChatId: string) => void;
  starredMessages: Message[];
  updateAvatar: (base64: string, mimeType?: string) => Promise<void>;
  updateGroupAvatar: (chatId: string, localUri: string) => Promise<void>;
  createDirectChat: (otherUserId: number, otherName: string, otherAvatar?: string) => Promise<string>;
  loadMessages: (chatId: string) => Promise<void>;
  applyIncomingMessageHint: (signal: ChatMessageSignal) => void;
  loadOlderMessages: (
    chatId: string,
    beforeTimestamp: number,
  ) => Promise<{ loaded: number; hasMore: boolean }>;
  refreshChats: () => Promise<void>;
  clearAllChatHistory: () => Promise<void>;
  /** Videh: hide from list, clear local messages until someone messages again. */
  deleteChatsFromList: (chatIds: string[]) => Promise<void>;
  /** Hide chats from list (persists until a new message is sent or received). */
  hideChatsInList: (chatIds: string[]) => Promise<void>;
  hiddenChatIds: string[];
  chatDeletedAtMap: ChatDeletedAtMap;
  getChatClearCutoff: (chatId: string) => number;
  sendImageMessage: (chatId: string, mediaUri: string, caption?: string, isViewOnce?: boolean, mediaKind?: "image" | "video") => void;
  sendPreparedMediaMessage: (
    chatId: string,
    opts: {
      mediaUrl?: string;
      localUri?: string;
      quality?: MediaQuality;
      kind: "image" | "video";
      caption?: string;
      isViewOnce?: boolean;
    },
  ) => void;
  sendAlbumMessage: (
    chatId: string,
    opts: { urls?: string[]; localUris?: string[]; caption?: string; quality?: MediaQuality },
  ) => void;
  consumeViewOnceMessage: (chatId: string, messageId: string) => Promise<string | null>;
  sendAudioMessage: (chatId: string, audioUri: string, durationSecs: number, waveform?: number[]) => void;
  sendDocumentMessage: (
    chatId: string,
    localUri: string,
    filename: string,
    fileSizeBytes: number,
    mimeType: string,
    opts?: { caption?: string; pageCount?: number },
  ) => void;
  cancelDocumentUpload: (chatId: string, messageId: string) => void;
  sendContactMessage: (chatId: string, contact: { name: string; phones: string[]; emails?: string[] }) => void;
  setTyping: (chatId: string) => void;
  clearTyping: (chatId: string) => void;
  deleteForEveryone: (chatId: string, messageId: string) => void;
  editMessage: (chatId: string, messageId: string, newText: string) => Promise<void>;
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
  clearCallLogs: () => Promise<boolean>;
  /** Who is typing per chat (names), updated via API poll + realtime. */
  typingByChatId: Record<string, string[]>;
  reportRemoteTyping: (chatId: string, names: string[]) => void;
  patchChatMessage: (chatId: string, messageId: string, patch: Partial<Message>) => void;
  patchChatInList: (chatId: string, patch: Partial<Chat>) => void;
  /** Fetch + apply group auto-translations for visible messages. */
  refreshGroupTranslations: (chatId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);


export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [chatsListReady, setChatsListReady] = useState(false);
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
  const chatDeletedAtRef = useRef<ChatDeletedAtMap>({});
  const [chatDeletedAtMap, setChatDeletedAtMap] = useState<ChatDeletedAtMap>({});
  const serverHistoryClearedRef = useRef<ChatDeletedAtMap>({});
  const hiddenChatIdsRef = useRef<string[]>([]);
  const [hiddenChatIds, setHiddenChatIds] = useState<string[]>([]);
  const messageCacheStoreRef = useRef<ChatMessageCacheStore>({});
  const loadMessagesRef = useRef<(chatId: string) => Promise<void>>(async () => {});
  const chatsForPersistRef = useRef<Chat[]>([]);

  useEffect(() => {
    chatsForPersistRef.current = chats;
  }, [chats]);

  const persistChatMessagesForUser = useCallback((chatId: string, messages: Message[]) => {
    const dbId = userRef.current?.dbId;
    if (!dbId || messages.length === 0) return;
    messageCacheStoreRef.current = rememberChatMessagesInStore(
      messageCacheStoreRef.current,
      chatId,
      messages as CachedChatMessage[],
    );
    schedulePersistChatMessageCache(dbId, messageCacheStoreRef.current);
  }, []);

  const applyOutboxToChats = useCallback((outbox: TextOutboxEntry[]) => {
    if (!outbox.length) return;
    setChats((prev) => mergeOutboxIntoChats(prev, outbox));
  }, []);

  const retryPendingTextOutbox = useCallback(async (userId: number) => {
    const outbox = await loadMessageOutbox(userId);
    if (!outbox.length) return;

    for (const entry of outbox) {
      const chatSnapshot = chatsForPersistRef.current.find((c) => String(c.id) === String(entry.chatId));
      const tempStillPending = chatSnapshot?.messages.some((m) => m.id === entry.tempId);
      if (!tempStillPending) {
        await removeFromMessageOutbox(userId, entry.tempId);
        continue;
      }

      const payload = {
        senderId: userId,
        content: entry.text,
        type: "text",
        clientMessageId: entry.tempId,
        replyToId: entry.replyToId && !entry.replyToId.startsWith("tmp_")
          ? Number(entry.replyToId)
          : undefined,
        statusReplyId: entry.statusReplyId ? Number(entry.statusReplyId) : undefined,
      };

      let res: Response;
      let data: { success?: boolean; message?: { id: number; expires_at?: string; is_kept?: boolean } | string; code?: string };
      try {
        res = await fetchWithTimeout(`${BASE_URL}/api/chats/${entry.chatId}/messages`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        }, 20_000);
        data = await res.json();
      } catch {
        continue;
      }

      if (res.status === 403) {
        await removeFromMessageOutbox(userId, entry.tempId);
        setChats((prev) =>
          prev.map((c) =>
            c.id === entry.chatId
              ? { ...c, messages: c.messages.filter((m) => m.id !== entry.tempId) }
              : c,
          ),
        );
        continue;
      }

      if (!data?.success) {
        if (res.status >= 500 || res.status === 429) continue;
        await removeFromMessageOutbox(userId, entry.tempId);
        setChats((prev) =>
          prev.map((c) =>
            c.id === entry.chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === entry.tempId ? { ...m, uploadFailed: true } : m,
                  ),
                }
              : c,
          ),
        );
        continue;
      }

      await removeFromMessageOutbox(userId, entry.tempId);
      if (data.message && typeof data.message === "object" && "id" in data.message) {
        const mid = String(data.message.id);
        const row = data.message;
        let confirmedMessages: Message[] = [];
        setChats((prev) =>
          prev.map((c) => {
            if (c.id !== entry.chatId) return c;
            let replaced = false;
            const mapped = c.messages.map((m) => {
              if (m.id === entry.tempId) {
                replaced = true;
                return {
                  ...m,
                  id: mid,
                  status: "delivered" as const,
                  uploadFailed: false,
                  expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : m.expiresAt,
                  isKept: row.is_kept ?? m.isKept,
                };
              }
              return m;
            });
            const withoutOrphanTemp = replaced ? mapped : mapped.filter((m) => m.id !== entry.tempId);
            const byId = new Map<string, Message>();
            for (const m of withoutOrphanTemp) {
              const prevMsg = byId.get(m.id);
              if (!prevMsg || (m.status === "delivered" || m.status === "read")) byId.set(m.id, m);
            }
            const messages = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
            confirmedMessages = messages;
            return { ...c, messages };
          }),
        );
        if (confirmedMessages.length > 0) {
          persistChatMessagesForUser(entry.chatId, confirmedMessages);
        }
      }
    }
  }, [persistChatMessagesForUser]);

  const supplementGroupMessageTranslations = useCallback(async (
    chatId: string,
    messages: Message[],
  ) => {
    const u = userRef.current;
    const chat = chatsForPersistRef.current.find((c) => String(c.id) === String(chatId));
    if (!u?.dbId || !chat) return;
    const prefs = await resolveGroupTranslationPrefs(chat, chatId, u.dbId, authSessionToken);
    if (!prefs) return;
    const needs = messagesNeedingGroupTranslation(messages, prefs);
    if (!needs.length) return;
    try {
      const results = await fetchGroupAutoTranslations({
        userId: u.dbId,
        sessionToken: authSessionToken,
        targetLang: prefs.targetLang,
        messages: needs,
      });
      if (!results.length) return;
      setChats((prev) =>
        prev.map((c) => {
          if (String(c.id) !== String(chatId)) return c;
          const byId = new Map(results.map((r) => [r.messageId, r]));
          const nextMessages = c.messages.map((m) => {
            const hit = byId.get(m.id);
            if (!hit) return m;
            return {
              ...m,
              translatedText: hit.translated,
              translationSourceLang: hit.sourceLang,
              translationTargetLang: prefs.targetLang,
            };
          });
          persistChatMessagesForUser(chatId, nextMessages);
          return { ...c, messages: nextMessages };
        }),
      );
    } catch {
      /* backup translate is best-effort */
    }
  }, [persistChatMessagesForUser]);

  const supplementGroupMessageTranslationsRef = useRef(supplementGroupMessageTranslations);
  supplementGroupMessageTranslationsRef.current = supplementGroupMessageTranslations;

  const refreshGroupTranslations = useCallback(async (chatId: string) => {
    const chat = chatsForPersistRef.current.find((c) => String(c.id) === String(chatId));
    if (!chat?.isGroup || !chat.messages?.length) return;
    await supplementGroupMessageTranslations(chatId, chat.messages);
  }, [supplementGroupMessageTranslations]);

  const patchChatMessageRef = useRef<(chatId: string, messageId: string, patch: Partial<Message>) => void>(() => {});

  useEffect(() => {
    void AsyncStorage.getItem("chatHistoryClearedAt").then((v) => {
      const n = v ? Number(v) : 0;
      if (Number.isFinite(n)) clearedHistoryAtRef.current = n;
    });
  }, []);

  const reloadChatListDeleteState = useCallback(async (userId: number) => {
    const [hidden, deletedMap] = await Promise.all([
      loadHiddenChatIds(userId),
      loadChatDeletedAtMap(userId),
    ]);
    hiddenChatIdsRef.current = hidden;
    setHiddenChatIds(hidden);
    chatDeletedAtRef.current = deletedMap;
    setChatDeletedAtMap(deletedMap);
  }, []);

  /** Videh: deleted chat reappears when a new message arrives after delete. */
  const restoreHiddenChatsWithNewActivity = useCallback(
    async (candidates: { id: string; lastMessageTime?: number }[]) => {
      const hidden = hiddenChatIdsRef.current;
      if (!hidden.length || !candidates.length) return;
      const deletedMap = chatDeletedAtRef.current;
      const toRestore = hidden.filter((id) => {
        const chat = candidates.find((c) => c.id === id);
        if (!chat?.lastMessageTime) return false;
        return shouldRestoreDeletedChat(id, hidden, deletedMap, chat.lastMessageTime);
      });
      if (!toRestore.length) return;
      const next = hidden.filter((id) => !toRestore.includes(id));
      hiddenChatIdsRef.current = next;
      setHiddenChatIds(next);
      const uid = userRef.current?.dbId;
      if (uid) await saveHiddenChatIds(uid, next);
    },
    [],
  );

  const getClearCutoff = useCallback(
    (chatId: string) =>
      Math.max(
        chatClearCutoff(
          chatId,
          clearedHistoryAtRef.current,
          chatDeletedAtRef.current,
          serverHistoryClearedRef.current,
        ),
        globalMessageRetentionCutoffMs(),
      ),
    [],
  );

  const filterCachedMessageStore = useCallback(
    (store: ChatMessageCacheStore): ChatMessageCacheStore => {
      const next: ChatMessageCacheStore = {};
      for (const [chatId, msgs] of Object.entries(store)) {
        const cutoff = getClearCutoff(chatId);
        const kept = filterMessagesAfterClearCutoff(msgs, cutoff);
        if (kept.length > 0) next[chatId] = kept;
      }
      return next;
    },
    [getClearCutoff],
  );

  const maskListFieldsIfCleared = (chat: Chat): Chat => {
    const cutoff = getClearCutoff(chat.id);
    if (cutoff <= 0) return chat;
    const lastTime = chat.lastMessageTime ?? 0;
    if (lastTime > cutoff) {
      return {
        ...chat,
        messages: chat.messages.filter((m) => m.timestamp > cutoff),
      };
    }
    return {
      ...chat,
      messages: [],
      lastMessage: undefined,
      lastMessageTime: undefined,
      unreadCount: 0,
    };
  };

  const formatLastMessagePreview = (lastMsg: {
    is_deleted?: boolean;
    type?: string;
    content?: string;
    media_url?: string;
  } | null | undefined): string | undefined => {
    if (!lastMsg) return undefined;
    if (String(lastMsg.type ?? "").toLowerCase() === "system") return undefined;
    if (lastMsg.is_deleted) return "This message was deleted";
    const preview = inferChatListPreview(lastMsg.type, String(lastMsg.content ?? ""), lastMsg.media_url);
    if (preview.startsWith("📍")) return preview;
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
        name: c.is_group
          ? (c.group_name?.trim() || "Group")
          : (otherUser?.name?.trim() || otherUser?.phone?.trim() || "Unknown"),
        avatar: resolvePublicAssetUrl(c.is_group ? c.group_avatar_url : otherUser?.avatar_url),
        lastMessage: formatLastMessagePreview(lastMsg),
        lastMessageTime: lastMsg
          ? new Date(lastMsg.created_at).getTime()
          : c.member_joined_at
            ? new Date(c.member_joined_at).getTime()
            : undefined,
        unreadCount: c.unread_count ?? 0,
        isGroup: c.is_group,
        isOnline: otherUser?.is_online ?? false,
        messages: [],
        isPinned: c.is_pinned ?? false,
        isMuted: c.is_muted ?? false,
        isArchived: c.is_archived ?? false,
        otherUserId: otherUser?.id,
        isKhataNotebook: c.group_description === "videh:khata_notebook",
        disappearAfterSeconds:
          c.disappear_after_seconds != null && Number(c.disappear_after_seconds) > 0
            ? Number(c.disappear_after_seconds)
            : null,
        autoTranslateEnabled: Boolean(c.auto_translate_enabled),
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
    let lastError = "Could not upload story media.";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(`${BASE_URL}/api/statuses/media`, {
          method: "POST",
          headers: authHeaders(),
          body: form,
        });
        const data = await res.json().catch(() => ({})) as { success?: boolean; url?: string; message?: string };
        if (res.ok && data.success && data.url) return data.url;
        lastError = data.message ?? lastError;
      } catch {
        /* retry */
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    throw new Error(lastError);
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

      const nextServerCleared: ChatDeletedAtMap = { ...serverHistoryClearedRef.current };
      const nextDeletedMap = { ...chatDeletedAtRef.current };
      let deletedMapChanged = false;
      for (const row of data.chats) {
        const id = String(row.id);
        if (!row.history_cleared_at) continue;
        const serverTs = new Date(row.history_cleared_at).getTime();
        if (!Number.isFinite(serverTs)) continue;
        nextServerCleared[id] = Math.max(nextServerCleared[id] ?? 0, serverTs);
        if (serverTs > (nextDeletedMap[id] ?? 0)) {
          nextDeletedMap[id] = serverTs;
          deletedMapChanged = true;
        }
      }
      serverHistoryClearedRef.current = nextServerCleared;
      if (deletedMapChanged) {
        chatDeletedAtRef.current = nextDeletedMap;
        setChatDeletedAtMap(nextDeletedMap);
        await saveChatDeletedAtMap(dbUserId, nextDeletedMap);
      }

      const mapped = mapDbChats(data.chats).filter(
        (c) => Boolean(c.lastMessageTime) || Boolean(c.lastMessage) || c.isGroup,
      );
      await restoreHiddenChatsWithNewActivity(
        mapped
          .filter((c) => typeof c.lastMessageTime === "number" && c.lastMessageTime > 0)
          .map((c) => ({ id: c.id, lastMessageTime: c.lastMessageTime })),
      );
      let mergedList: Chat[] = [];
      setChats((prev) => {
        const mergedFromServer = mapped.map((newChat) => {
          const old = prev.find((c) => c.id === newChat.id);
          const cached = messageCacheStoreRef.current[String(newChat.id)] as Message[] | undefined;
          const rawMessages =
            old?.messages?.length
              ? old.messages
              : cached?.length
                ? (cached as Message[]).map((m) => coerceAlbumMessageFields(m))
                : [];
          const cutoff = getClearCutoff(newChat.id);
          const messages = cutoff > 0
            ? rawMessages.filter((m) => m.timestamp > cutoff)
            : rawMessages;
          const lastFromCache = messages.length > 0 ? messages[messages.length - 1] : undefined;
          const cachePreview = messagePreviewText(lastFromCache);
          const cacheTime = lastFromCache?.timestamp ?? 0;
          const serverTime = newChat.lastMessageTime ?? 0;
          const useCachePreview = cacheTime > serverTime + 500;
          return maskListFieldsIfCleared({
            ...newChat,
            messages,
            lastMessage: useCachePreview ? (cachePreview ?? newChat.lastMessage) : newChat.lastMessage,
            lastMessageTime: Math.max(cacheTime, serverTime) || newChat.lastMessageTime,
            isPinned: newChat.isPinned ?? old?.isPinned,
            isMuted: newChat.isMuted ?? old?.isMuted,
            isArchived: newChat.isArchived ?? old?.isArchived,
          });
        });
        const serverIds = new Set(mergedFromServer.map((c) => c.id));
        const pendingGroups = prev.filter((c) => c.isGroup && !serverIds.has(c.id));
        mergedList = [...pendingGroups, ...mergedFromServer].sort(
          (a, b) => (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0),
        );
        return mergedList;
      });
      schedulePersistChatListCache(userRef.current?.dbId ?? dbUserId, mergedList);
      const prefetchIds = mapped
        .slice()
        .sort((a, b) => (b.lastMessageTime ?? 0) - (a.lastMessageTime ?? 0))
        .slice(0, 8)
        .map((c) => c.id)
        .filter((id) => {
          const cached = messageCacheStoreRef.current[id];
          if (!cached?.length) return true;
          const cacheLast = cached[cached.length - 1]?.timestamp ?? 0;
          const chatRow = mapped.find((c) => c.id === id);
          return (chatRow?.lastMessageTime ?? 0) > cacheLast + 500;
        });
      if (prefetchIds.length > 0) {
        setTimeout(() => {
          for (const id of prefetchIds) void loadMessagesRef.current(id);
        }, 0);
      }
    } catch {
      /* keep cached list */
    } finally {
      setChatsListReady(true);
    }
  }, [restoreHiddenChatsWithNewActivity]);

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
        const rawEditor = s.editor_data as StoryEditorData | null | undefined;
        const editorData = rawEditor
          ? {
              ...rawEditor,
              musicUri: rawEditor.musicUri
                ? resolvePublicAssetUrl(rawEditor.musicUri) ?? rawEditor.musicUri
                : undefined,
            }
          : undefined;
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
          mediaUrl: resolvePublicAssetUrl(s.media_url) ?? s.media_url ?? undefined,
          timestamp: new Date(s.created_at).getTime(),
          expiresAt: s.expires_at ? new Date(s.expires_at).getTime() : undefined,
          isBoosted: Boolean(s.is_boosted),
          boostEndsAt: s.boost_ends_at ? new Date(s.boost_ends_at).getTime() : undefined,
          boostStatus: s.boost_status ?? undefined,
          boostVerificationNote: s.boost_verification_note ?? undefined,
          editorData,
          viewed: Boolean(s.viewed),
          backgroundColor: s.background_color ?? "#5B4FE8",
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
            const [msgCache, listRows, outbox] = await Promise.all([
              loadChatMessageCache(parsed.dbId),
              loadChatListCache(parsed.dbId),
              loadMessageOutbox(parsed.dbId),
            ]);
            messageCacheStoreRef.current = filterCachedMessageStore(msgCache);
            await reloadChatListDeleteState(parsed.dbId);
            if (listRows.length > 0) {
              setChats(mergeOutboxIntoChats(
                buildChatsFromCache(listRows, messageCacheStoreRef.current),
                outbox,
              ));
              setChatsListReady(true);
            } else if (outbox.length > 0) {
              applyOutboxToChats(outbox);
            }
            schedulePersistChatMessageCache(parsed.dbId, messageCacheStoreRef.current);
            void retryPendingTextOutbox(parsed.dbId);
            void loadChats(parsed.dbId);
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
            void import("@/lib/reelsFeedCache").then(({ prefetchReelsFeed }) =>
              prefetchReelsFeed(parsed.dbId!, parsed.sessionToken),
            );
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
        void retryPendingTextOutbox(activeUid);
      } else if (nextState === "background" || nextState === "inactive") {
        api(`/users/${activeUid}/offline`, { method: "POST" }).catch(() => {});
        const uid = userRef.current?.dbId;
        if (uid) schedulePersistChatListCache(uid, chatsForPersistRef.current);
        void flushChatMessageCache();
        void flushChatListCache();
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [isAuthenticated]);

  useEffect(() => {
    const uid = user?.dbId;
    if (!uid || chats.length === 0) return;
    schedulePersistChatListCache(uid, chats);
  }, [chats, user?.dbId]);

  const setUser = useCallback(async (u: UserProfile) => {
    authSessionToken = u.sessionToken ?? null;
    setUserState(u);
    setIsAuthenticated(true);
    await AsyncStorage.setItem("videh_user", JSON.stringify(u));

    if (u.dbId) {
      const [msgCache, listRows, outbox] = await Promise.all([
        loadChatMessageCache(u.dbId),
        loadChatListCache(u.dbId),
        loadMessageOutbox(u.dbId),
      ]);
      messageCacheStoreRef.current = filterCachedMessageStore(msgCache);
      if (listRows.length > 0) {
        setChats(mergeOutboxIntoChats(
          buildChatsFromCache(listRows, messageCacheStoreRef.current),
          outbox,
        ));
        setChatsListReady(true);
      } else if (outbox.length > 0) {
        applyOutboxToChats(outbox);
      }
      await reloadChatListDeleteState(u.dbId);
      void retryPendingTextOutbox(u.dbId);
      void loadChats(u.dbId);
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
        void import("@/lib/syncContactsToServer").then(({ syncDeviceContactsToServer }) =>
          syncDeviceContactsToServer(`${getApiUrl()}`, u.sessionToken).catch(() => 0),
        );
      }
      void import("@/lib/reelsFeedCache").then(({ prefetchReelsFeed }) =>
        prefetchReelsFeed(u.dbId!, u.sessionToken),
      );
    }
  }, [loadChats, loadStatuses, reloadChatListDeleteState]);

  useEffect(() => {
    const uid = user?.dbId;
    if (!isAuthenticated || !uid) return;
    const tick = () => {
      const hasPending = chatsForPersistRef.current.some((c) =>
        c.messages.some((m) => m.senderId === "me" && m.id.startsWith("tmp_") && !m.uploadFailed),
      );
      if (hasPending) void retryPendingTextOutbox(uid);
    };
    const timer = setInterval(tick, TEXT_OUTBOX_RETRY_MS);
    return () => clearInterval(timer);
  }, [isAuthenticated, user?.dbId, retryPendingTextOutbox]);

  const refreshChats = useCallback(async () => {
    const u = userRef.current;
    if (u?.dbId) await loadChats(u.dbId);
  }, [loadChats]);

  /** Videh "clear all chats": hides existing message history on this device. */
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

  const deleteChatsFromList = useCallback(async (chatIds: string[]) => {
    if (chatIds.length === 0) return;
    const normalizedIds = chatIds.map(String);
    const now = Date.now();
    const nextMap = { ...chatDeletedAtRef.current };
    for (const id of normalizedIds) nextMap[id] = now;
    chatDeletedAtRef.current = nextMap;
    setChatDeletedAtMap(nextMap);

    const uid = userRef.current?.dbId;
    if (uid) {
      await saveChatDeletedAtMap(uid, nextMap);
      const clearedResults = await Promise.all(
        normalizedIds.map(async (chatId) => {
          try {
            const data = await api(`/chats/${chatId}/clear-history`, {
              method: "POST",
              body: JSON.stringify({ userId: uid }),
            }) as { success?: boolean; clearedAt?: string };
            if (data.success && data.clearedAt) {
              const ts = new Date(data.clearedAt).getTime();
              if (Number.isFinite(ts)) return { chatId, ts };
            }
          } catch {
            /* server may be offline — local cutoff still applies */
          }
          return { chatId, ts: now };
        }),
      );
      for (const { chatId, ts } of clearedResults) {
        nextMap[chatId] = Math.max(nextMap[chatId] ?? 0, ts);
        serverHistoryClearedRef.current[chatId] = Math.max(serverHistoryClearedRef.current[chatId] ?? 0, ts);
      }
      chatDeletedAtRef.current = nextMap;
      setChatDeletedAtMap(nextMap);
      await saveChatDeletedAtMap(uid, nextMap);
    }

    const idSet = new Set(normalizedIds);
    for (const chatId of normalizedIds) {
      delete messageCacheStoreRef.current[chatId];
    }
    if (uid) schedulePersistChatMessageCache(uid, messageCacheStoreRef.current);

    setChats((prev) =>
      prev.map((c) =>
        idSet.has(String(c.id))
          ? { ...c, messages: [], lastMessage: undefined, lastMessageTime: undefined, unreadCount: 0 }
          : c,
      ),
    );
  }, []);

  const hideChatsInList = useCallback(
    async (chatIds: string[]) => {
      if (!chatIds.length) return;
      const next = Array.from(new Set([...hiddenChatIdsRef.current, ...chatIds.map(String)]));
      hiddenChatIdsRef.current = next;
      setHiddenChatIds(next);
      const uid = userRef.current?.dbId;
      if (uid) await saveHiddenChatIds(uid, next);
      await deleteChatsFromList(chatIds);
    },
    [deleteChatsFromList],
  );

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

  const updateGroupAvatar = useCallback(async (chatId: string, localUri: string) => {
    const u = userRef.current;
    if (!u?.dbId) return;
    const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    const mimeType = localUri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
    const data = await api(`/chats/${chatId}/group-avatar`, {
      method: "PUT",
      body: JSON.stringify({ requesterId: u.dbId, base64, mimeType }),
    }) as { success?: boolean; groupAvatarUrl?: string; message?: string };
    if (!data.success || !data.groupAvatarUrl) {
      throw new Error(data.message ?? "Could not update group photo.");
    }
    const avatar = resolvePublicAssetUrl(data.groupAvatarUrl) ?? data.groupAvatarUrl;
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, avatar } : c)));
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
    setChatsListReady(false);
    hiddenChatIdsRef.current = [];
    setHiddenChatIds([]);
    chatDeletedAtRef.current = {};
    setChatDeletedAtMap({});
    serverHistoryClearedRef.current = {};
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
      viewerDbId: userRef.current?.dbId ?? null,
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
      viewerDbId: user?.dbId ?? null,
    });
  }, [chats, user?.dbId]);

  const loadMessagesAfterHintTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Show incoming text immediately from push/SSE before the messages API catches up (Videh). */
  const applyIncomingMessageHint = useCallback((signal: ChatMessageSignal) => {
    const chatId = String(signal.chatId);
    const u = userRef.current;
    const serverMessageId = signal.messageId ? String(signal.messageId) : undefined;
    const text = signal.body?.trim();
    const mediaUrl = signal.mediaUrl?.trim();
    const declaredType = signal.messageType;
    const hintType = normalizeMessageType(declaredType, text ?? "", mediaUrl);
    if (!serverMessageId && !text && !mediaUrl && !declaredType) return;

    const albumUrls = resolveAlbumUrls(text ?? "", { mediaUrl });
    const albumCountFromLabel = parseAlbumPhotoCountLabel(text);
    const resolvedHintType =
      albumUrls && albumUrls.length >= 2
        ? "album"
        : declaredType === "album" || albumCountFromLabel != null
          ? "album"
          : hintType;

    const isMediaType =
      resolvedHintType === "album"
      || resolvedHintType === "image"
      || resolvedHintType === "video"
      || resolvedHintType === "audio"
      || resolvedHintType === "document";
    const hasRenderableAlbum = resolvedHintType === "album" && (albumUrls?.length ?? 0) >= 2;
    const hasRenderableImageVideo =
      (resolvedHintType === "image" || resolvedHintType === "video") && Boolean(mediaUrl);
    const hasKnownContent =
      Boolean(text)
      || Boolean(mediaUrl)
      || hasRenderableAlbum
      || hasRenderableImageVideo
      || (resolvedHintType === "audio" && Boolean(text))
      || resolvedHintType === "location"
      || resolvedHintType === "contact"
      || resolvedHintType === "call";

    const senderId =
      signal.senderId != null
        ? String(signal.senderId) === String(u?.dbId)
          ? "me"
          : String(signal.senderId)
        : "other";
    if (senderId === "me") return;

    const bumpUnreadAndRefresh = () => {
      setChats((prev) =>
        prev.map((c) => {
          if (String(c.id) !== chatId) return c;
          const preview = inferChatListPreview(resolvedHintType, text ?? "", mediaUrl);
          return {
            ...c,
            lastMessage: preview || c.lastMessage,
            lastMessageTime: Date.now(),
            unreadCount: Math.max(c.unreadCount ?? 0, 1),
          };
        }),
      );
      void loadMessagesRef.current?.(chatId);
      setTimeout(() => void loadMessagesRef.current?.(chatId), MESSAGE_HINT_API_RETRY_MS);
    };

    if (!hasKnownContent) {
      if (!serverMessageId) return;
      bumpUnreadAndRefresh();
      return;
    }

    const hintPreviewText =
      inferChatListPreview(declaredType ?? resolvedHintType, text ?? "", mediaUrl)
      || (resolvedHintType === "image"
        ? "📷 Photo"
        : resolvedHintType === "video"
          ? "Video"
          : resolvedHintType === "audio"
            ? "Voice message"
            : resolvedHintType === "document"
              ? "Document"
              : resolvedHintType === "album"
                ? albumChatPreview(albumUrls?.length ?? albumCountFromLabel ?? 2)
                : "");

    if (!hintPreviewText.trim()) {
      if (serverMessageId) bumpUnreadAndRefresh();
      return;
    }

    const shouldSkipBubble =
      isMediaType
      && !hasRenderableAlbum
      && !hasRenderableImageVideo
      && !(resolvedHintType === "audio" && text);

    const buildHintMsg = (): Message => {
      const hintBodyText =
        resolvedHintType === "text" && text?.trim()
          ? text.trim()
          : hintPreviewText;
      return coerceAlbumMessageFields({
        id: serverMessageId ? `hint_${serverMessageId}` : `hint_t${Date.now()}`,
        text: hintBodyText,
        timestamp: Date.now(),
        senderId,
        senderName: signal.senderName,
        type: resolvedHintType,
        mediaUrl: albumUrls?.[0] ?? mediaUrl ?? undefined,
        albumUrls,
        status: "delivered",
      });
    };

    setChats((prev) =>
      prev.map((c) => {
        if (String(c.id) !== chatId) return c;
        const msgs = c.messages ?? [];

        if (serverMessageId && msgs.some((m) => m.id === serverMessageId || m.id === `hint_${serverMessageId}`)) {
          return c;
        }

        const hintId = serverMessageId ? `hint_${serverMessageId}` : null;
        const existingHintIdx = hintId ? msgs.findIndex((m) => m.id === hintId) : -1;
        if (existingHintIdx >= 0) {
          const upgraded = buildHintMsg();
          const prevHint = msgs[existingHintIdx];
          const prevUrls = prevHint.albumUrls?.length ?? 0;
          const nextUrls = upgraded.albumUrls?.length ?? 0;
          if (nextUrls <= prevUrls && prevHint.text === upgraded.text && prevHint.type === upgraded.type) {
            return c;
          }
          if (shouldSkipBubble && nextUrls < 2) {
            return c;
          }
          const nextMsgs = [...msgs];
          nextMsgs[existingHintIdx] = { ...upgraded, id: hintId! };
          const preview = inferChatListPreview(resolvedHintType, text ?? "", mediaUrl);
          return {
            ...c,
            messages: nextMsgs.sort((a, b) => a.timestamp - b.timestamp),
            lastMessage: preview || c.lastMessage,
            lastMessageTime: Date.now(),
            unreadCount: Math.max(c.unreadCount ?? 0, 1),
          };
        }

        if (
          text
          && msgs.some(
            (m) =>
              m.senderId === senderId
              && m.text.trim() === text.trim()
              && Date.now() - m.timestamp < 120_000,
          )
        ) {
          return c;
        }

        if (shouldSkipBubble) {
          const preview = inferChatListPreview(resolvedHintType, text ?? "", mediaUrl);
          return {
            ...c,
            lastMessage: preview || c.lastMessage,
            lastMessageTime: Date.now(),
            unreadCount: Math.max(c.unreadCount ?? 0, 1),
          };
        }

        const hintMsg = buildHintMsg();
        const merged = [...msgs, hintMsg].sort((a, b) => a.timestamp - b.timestamp);
        const preview = inferChatListPreview(resolvedHintType, text ?? "", mediaUrl);
        const now = Date.now();
        return {
          ...c,
          messages: merged,
          lastMessage: preview || c.lastMessage,
          lastMessageTime: now,
          unreadCount: Math.max(c.unreadCount ?? 0, 1),
        };
      }),
    );

    const activityAt = Date.now();
    if (activityAt > (chatDeletedAtRef.current[chatId] ?? 0)) {
      void restoreHiddenChatsWithNewActivity([{ id: chatId, lastMessageTime: activityAt }]);
    }

    if (isMediaType) {
      void loadMessagesRef.current?.(chatId);
    } else {
      void loadMessagesRef.current?.(chatId);
      setTimeout(() => void loadMessagesRef.current?.(chatId), MESSAGE_HINT_API_DELAY_MS);
      setTimeout(() => void loadMessagesRef.current?.(chatId), MESSAGE_HINT_API_RETRY_MS);
    }

    const hintedChat = chatsForPersistRef.current.find((c) => String(c.id) === chatId);
    if (hintedChat?.isGroup && resolvedHintType === "text" && u?.dbId) {
      void (async () => {
        const latest = chatsForPersistRef.current.find((c) => String(c.id) === chatId);
        if (!latest?.messages?.length) return;
        const rows = await translateIncomingGroupMessages({
          chatId,
          userId: u.dbId!,
          sessionToken: authSessionToken,
          chat: latest,
          messages: latest.messages,
        });
        for (const row of rows) {
          patchChatMessageRef.current(chatId, row.messageId, {
            translatedText: row.translated,
            translationSourceLang: row.sourceLang,
            translationTargetLang: row.targetLang,
          });
        }
        void supplementGroupMessageTranslationsRef.current(chatId, latest.messages);
      })();
    }
  }, [restoreHiddenChatsWithNewActivity]);

  const patchChatMessage = useCallback((chatId: string, messageId: string, patch: Partial<Message>) => {
    setChats((prev) =>
      prev.map((c) =>
        c.id !== chatId
          ? c
          : { ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) },
      ),
    );
  }, []);
  patchChatMessageRef.current = patchChatMessage;

  const patchChatInList = useCallback((chatId: string, patch: Partial<Chat>) => {
    setChats((prev) =>
      prev.map((c) => (String(c.id) === String(chatId) ? { ...c, ...patch } : c)),
    );
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const u = userRef.current;
      const prevChat = chatsForPersistRef.current.find((c) => String(c.id) === String(chatId));
      const translationPrefs = prevChat?.isGroup && u?.dbId
        ? await resolveGroupTranslationPrefs(prevChat, chatId, u.dbId, authSessionToken)
        : null;

      const data = await api(
        `/chats/${chatId}/messages?limit=80&userId=${u?.dbId ?? 0}`,
      ) as { success: boolean; messages: any[] };
      if (!data.success || !data.messages) return;

      const clearedAt = getClearCutoff(chatId);
      const rawMessages = clearedAt > 0
        ? data.messages.filter((m: any) => new Date(m.created_at).getTime() > clearedAt)
        : data.messages;

      let mergedMessages: Message[] = [];

      setChats((prev) => {
        const prevChat = prev.find((c) => String(c.id) === String(chatId));
        const prevById = new Map((prevChat?.messages ?? []).map((pm) => [pm.id, pm]));

        const msgs: Message[] = rawMessages.map((m: any) => {
          const prevLocal = prevById.get(String(m.id));
          let mapped = mapServerRowToMessage(m, u?.dbId, prevLocal);
          if (
            translationPrefs
            && mapped.translatedText
            && mapped.translationTargetLang
            && mapped.translationTargetLang !== translationPrefs.targetLang
          ) {
            mapped = {
              ...mapped,
              translatedText: undefined,
              translationSourceLang: undefined,
              translationTargetLang: undefined,
            };
          }
          return mapped;
        });

        return prev.map((c) => {
          if (String(c.id) !== String(chatId)) return c;
          const prevMsgs = c.messages ?? [];
          const prevStable = prevMsgs.filter((m) => !m.id.startsWith("hint_"));
          const hasPendingHints = prevMsgs.some((m) => m.id.startsWith("hint_"));
          const sameServerWindow = (a: Message, b: Message) =>
            a.id === b.id
            && a.text === b.text
            && a.status === b.status
            && a.type === b.type
            && a.mediaUrl === b.mediaUrl
            && (a.albumUrls?.length ?? 0) === (b.albumUrls?.length ?? 0)
            && (a.reactions?.length ?? 0) === (b.reactions?.length ?? 0)
            && (a.translatedText ?? "") === (b.translatedText ?? "");
          if (
            !hasPendingHints
            && serverWindowMatchesLocalTail(prevStable, msgs, sameServerWindow)
          ) {
            return c;
          }
          const serverWithHistory = preserveHistoricallyLoadedMessages(prevStable, msgs, clearedAt);
          const pendingLocal = collectPendingLocalMessages(prevMsgs, serverWithHistory);
          let merged = mergeServerWithPending(serverWithHistory, pendingLocal);
          merged = dedupeChatMessages(filterMessagesAfterClearCutoff(merged, clearedAt));
          mergedMessages = merged;
          const last = merged.length > 0 ? merged[merged.length - 1] : undefined;
          return {
            ...c,
            messages: merged,
            lastMessage: messagePreviewText(last) ?? c.lastMessage,
            lastMessageTime: last?.timestamp ?? c.lastMessageTime,
          };
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
            const { documentFilenameFromText } = await import("@/lib/documentMessage");
            const filename = documentFilenameFromText(m.text);
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
      if (mergedMessages.length > 0) {
        void supplementGroupMessageTranslations(chatId, mergedMessages);
      }
      const cacheUserId = userRef.current?.dbId;
      if (cacheUserId) {
        const toPersist = mergedMessages.length > 0
          ? mergedMessages
          : dedupeChatMessages(
              (chatsForPersistRef.current.find((c) => String(c.id) === String(chatId))?.messages ?? [])
                .filter((m) => !m.id.startsWith("tmp_") && !m.id.startsWith("hint_")),
            );
        if (toPersist.length > 0) {
          persistChatMessagesForUser(chatId, toPersist);
          void flushChatMessageCache();
        }
      }
    } catch {}
  }, [patchChatMessage, persistChatMessagesForUser, supplementGroupMessageTranslations]);

  loadMessagesRef.current = loadMessages;

  /** Defer API refresh so the server row exists before we merge (avoids hint flicker). */
  const scheduleLoadMessagesAfterHint = useCallback(
    (chatId: string, opts?: { media?: boolean }) => {
      const key = String(chatId);
      const media = opts?.media === true;
      const firstDelay = media ? 0 : MESSAGE_HINT_API_DELAY_MS;

      const pending = loadMessagesAfterHintTimersRef.current.get(key);
      if (pending) clearTimeout(pending);
      const timer = setTimeout(() => {
        loadMessagesAfterHintTimersRef.current.delete(key);
        void loadMessages(chatId);
      }, firstDelay);
      loadMessagesAfterHintTimersRef.current.set(key, timer);

      const retryKey = `${key}:retry`;
      const pendingRetry = loadMessagesAfterHintTimersRef.current.get(retryKey);
      if (pendingRetry) clearTimeout(pendingRetry);
      const retryTimer = setTimeout(() => {
        loadMessagesAfterHintTimersRef.current.delete(retryKey);
        void loadMessages(chatId);
      }, media ? MESSAGE_HINT_API_RETRY_MS : MESSAGE_HINT_API_RETRY_MS);
      loadMessagesAfterHintTimersRef.current.set(retryKey, retryTimer);

      if (media) {
        const mediaRetryKey = `${key}:media`;
        const pendingMedia = loadMessagesAfterHintTimersRef.current.get(mediaRetryKey);
        if (pendingMedia) clearTimeout(pendingMedia);
        const mediaTimer = setTimeout(() => {
          loadMessagesAfterHintTimersRef.current.delete(mediaRetryKey);
          void loadMessages(chatId);
        }, MESSAGE_HINT_MEDIA_RETRY_MS);
        loadMessagesAfterHintTimersRef.current.set(mediaRetryKey, mediaTimer);
      }
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

        const clearedAt = getClearCutoff(chatId);
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
            const merged = filterMessagesAfterClearCutoff(
              [...older, ...c.messages].sort((a, b) => a.timestamp - b.timestamp),
              clearedAt,
            );
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
          try {
            const parsed = JSON.parse(raw ?? "") as { payload?: unknown };
            const { emitCallSignal } = require("@/lib/callEvents") as typeof import("@/lib/callEvents");
            emitCallSignal((parsed.payload ?? parsed) as any);
          } catch {
            /* ignore */
          }
          setTimeout(() => runCalls(), 2500);
        }
        return;
      }
      try {
        if (!raw) return;
        const parsed = JSON.parse(raw) as {
          chatId?: string | number;
          payload?: {
            action?: string;
            messageId?: string | number;
            messageIds?: Array<string | number>;
            content?: string;
            type?: string;
            mediaUrl?: string;
            senderId?: string | number;
            senderName?: string;
            deleted?: boolean;
          };
        };
        const cid = parsed.chatId != null ? String(parsed.chatId) : null;
        const payload = parsed.payload ?? {};
        const action = payload.action;

        if (action === "disappear_expired" && cid) {
          const expiredIds = new Set((payload.messageIds ?? []).map(String));
          if (expiredIds.size > 0) {
            setChats((prev) =>
              prev.map((c) =>
                c.id === cid
                  ? { ...c, messages: c.messages.filter((m) => !expiredIds.has(m.id)) }
                  : c,
              ),
            );
          }
          return;
        }
        if (action === "disappear_kept" && cid && payload.messageId != null) {
          const keptId = String(payload.messageId);
          setChats((prev) =>
            prev.map((c) =>
              c.id === cid
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === keptId ? { ...m, isKept: true } : m,
                    ),
                  }
                : c,
            ),
          );
          return;
        }

        if (payload.deleted && cid && payload.messageId != null) {
          const deletedId = String(payload.messageId);
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== cid) return c;
              const messages = c.messages.map((m) =>
                m.id === deletedId ? asDeletedMessage(m) : m,
              );
              const last = [...messages].reverse().find((m) => m.type !== "deleted");
              return {
                ...c,
                messages,
                lastMessage: messagePreviewText(last),
                lastMessageTime: last?.timestamp ?? c.lastMessageTime,
              };
            }),
          );
          const uid = userRef.current?.dbId;
          if (uid && activeChatIdRef.current === cid) {
            void loadMessages(cid);
          }
          return;
        }

        const messageId =
          payload.messageId != null ? String(payload.messageId) : undefined;
        const bodyRaw = payload.content?.trim() ?? "";
        const senderName = payload.senderName?.trim();
        const senderId =
          payload.senderId != null ? String(payload.senderId) : undefined;
        const mediaUrl = payload.mediaUrl?.trim();
        const messageType = normalizeMessageType(payload.type, bodyRaw, mediaUrl);
        const notifyBody = inferChatListPreview(payload.type, bodyRaw, mediaUrl);
        if (cid) {
          const signal: ChatMessageSignal = {
            chatId: cid,
            messageId,
            body: bodyRaw,
            senderName,
            senderId,
            messageType,
            mediaUrl,
          };
          emitChatMessageSignal(signal);
          if (activeChatIdRef.current === cid) {
            scheduleLoadMessagesAfterHint(cid, { media: isMediaMessageType(messageType) });
            if (!isMediaMessageType(messageType)) {
              void loadMessages(cid);
            }
          }
        }
        if (cid) {
          const uid = userRef.current?.dbId;
          const isOwnMessage =
            senderId != null && uid != null && String(senderId) === String(uid);
          if (!isOwnMessage) {
            void deliverPremiumChatMessageNotification({
              chatId: cid,
              messageId,
              senderId,
              body: notifyBody,
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
        }
      } catch {
        /* ignore malformed SSE payload */
      }
    };
    let detachStream: (() => void) | null = null;
    const connectStream = () => {
      const uid = userRef.current?.dbId;
      if (!uid) return;
      detachStream?.();
      detachStream = connectChatEventStream(uid, authSessionToken, onChatEvent);
    };
    connectStream();

    const refreshOpenChat = () => {
      const cid = activeChatIdRef.current;
      if (cid) void loadMessages(cid);
    };

    /** SSE delivers instantly; polling is backup only (reduces API load at scale). */
    const chatTimer = setInterval(runChats, FOREGROUND_CHAT_LIST_POLL_MS);
    const activeChatMsgTimer = setInterval(() => {
      const cid = activeChatIdRef.current;
      if (!cid) return;
      // Open chat screen already polls; skip duplicate backup fetches.
      if (getNotificationActiveChatId() === cid) return;
      void loadMessages(cid);
    }, ACTIVE_CHAT_MESSAGE_BACKUP_POLL_MS);
    const statusTimer = setInterval(runStatuses, 30000);
    const callTimer = setInterval(runCalls, 45000);
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      connectStream();
      runChats();
      refreshOpenChat();
    });
    return () => {
      detachStream?.();
      appStateSub.remove();
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
        const mt = signal.messageType
          ?? normalizeMessageType(signal.messageType, signal.body ?? "", signal.mediaUrl);
        scheduleLoadMessagesAfterHint(cid, { media: isMediaMessageType(mt) });
      }
    });
  }, [isAuthenticated, applyIncomingMessageHint, scheduleLoadMessagesAfterHint]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const pruneExpired = () => {
      setChats((prev) => {
        let changed = false;
        const next = prev.map((c) => {
          if (!(c.disappearAfterSeconds ?? 0)) return c;
          const filtered = c.messages.filter((m) => !isDisappearingMessageExpired(m));
          if (filtered.length === c.messages.length) return c;
          changed = true;
          return { ...c, messages: filtered };
        });
        return changed ? next : prev;
      });
    };
    pruneExpired();
    const timer = setInterval(pruneExpired, 30_000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  const sendMessage = useCallback((
    chatId: string,
    text: string,
    replyToId?: string,
    replyQuote?: { replyText: string; replySenderName?: string; replyQuotedSenderId?: string; replyType?: string },
    statusReply?: StatusReplyMeta,
  ) => {
    if (!text.trim()) return;
    const u = userRef.current;
    const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
    let newMsg: Message = {
      id: tempId,
      text,
      timestamp: Date.now(),
      senderId: "me",
      type: "text",
      status: "delivered",
      replyToId,
      replyText: replyQuote?.replyText,
      replySenderName: replyQuote?.replySenderName,
      replyQuotedSenderId: replyQuote?.replyQuotedSenderId,
      replyType: replyQuote?.replyType,
      ...(statusReply ? messageFromStatusReplyMeta(statusReply) : {}),
    };
    const chatListPreview = text.length > 120 ? `${text.slice(0, 117).trimEnd()}…` : text;
    const sentAt = Date.now();
    setChats((prev) => {
      const chat = prev.find((c) => c.id === chatId);
      const expiresAt = computeClientMessageExpiresAt(chat?.disappearAfterSeconds ?? null);
      if (expiresAt) newMsg = { ...newMsg, expiresAt };
      return prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: [...c.messages, newMsg].sort((a, b) => a.timestamp - b.timestamp),
              lastMessage: chatListPreview,
              lastMessageTime: sentAt,
            }
          : c,
      );
    });
    if (sentAt > (chatDeletedAtRef.current[chatId] ?? 0)) {
      void restoreHiddenChatsWithNewActivity([{ id: chatId, lastMessageTime: sentAt }]);
    }

    if (u?.dbId) {
      const outboxEntry: TextOutboxEntry = {
        tempId,
        chatId,
        text,
        timestamp: sentAt,
        replyToId,
        replyText: replyQuote?.replyText,
        replySenderName: replyQuote?.replySenderName,
        replyQuotedSenderId: replyQuote?.replyQuotedSenderId,
        replyType: replyQuote?.replyType,
        statusReplyId: statusReply?.statusId,
      };
      void enqueueChatTextSend(chatId, async () => {
        await addTextToMessageOutbox(u.dbId!, outboxEntry);
        const listSnapshot = chatsForPersistRef.current.map((c) =>
          c.id === chatId
            ? { ...c, lastMessage: chatListPreview, lastMessageTime: sentAt }
            : c,
        );
        schedulePersistChatListCache(u.dbId!, listSnapshot);
        void flushChatListCache();

        const payload = {
          senderId: u.dbId,
          content: text,
          type: "text",
          clientMessageId: tempId,
          replyToId: replyToId && !replyToId.startsWith("tmp_") ? Number(replyToId) : undefined,
          statusReplyId: statusReply?.statusId ? Number(statusReply.statusId) : undefined,
        };
        const postOnce = async () => {
          const res = await fetchWithTimeout(`${BASE_URL}/api/chats/${chatId}/messages`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload),
          }, 20_000);
          return { res, data: (await res.json()) as {
            success?: boolean;
            message?: { id: number } | string;
            code?: string;
          } };
        };

        let res: Response;
        let data: Awaited<ReturnType<typeof postOnce>>["data"];
        try {
          ({ res, data } = await postOnce());
        } catch {
          return;
        }

        if (res.status === 403) {
          const msg = typeof data.message === "string" ? data.message : "You are not allowed to send messages in this chat.";
          await removeFromMessageOutbox(u.dbId!, tempId);
          Alert.alert("Cannot send message", msg);
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c,
            ),
          );
          return;
        }
        if (!data?.success) {
          if (res.status >= 500 || res.status === 429) return;
          await removeFromMessageOutbox(u.dbId!, tempId);
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === tempId ? { ...m, uploadFailed: true } : m,
                    ),
                  }
                : c,
            ),
          );
          return;
        }
        await removeFromMessageOutbox(u.dbId!, tempId);
        if (data.message && typeof data.message === "object" && "id" in data.message) {
          const mid = String(data.message.id);
          const row = data.message as { expires_at?: string; is_kept?: boolean };
          let confirmedMessages: Message[] = [];
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== chatId) return c;
              let replaced = false;
              const mapped = c.messages.map((m) => {
                if (m.id === tempId) {
                  replaced = true;
                  return {
                    ...m,
                    id: mid,
                    status: "delivered" as const,
                    uploadFailed: false,
                    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : m.expiresAt,
                    isKept: row.is_kept ?? m.isKept,
                  };
                }
                return m;
              });
              const withoutOrphanTemp = replaced ? mapped : mapped.filter((m) => m.id !== tempId);
              const byId = new Map<string, Message>();
              for (const m of withoutOrphanTemp) {
                const prev = byId.get(m.id);
                if (!prev || (m.status === "delivered" || m.status === "read")) byId.set(m.id, m);
              }
              const messages = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
              confirmedMessages = messages;
              return { ...c, messages };
            }),
          );
          if (confirmedMessages.length > 0) {
            persistChatMessagesForUser(chatId, confirmedMessages);
            void flushChatMessageCache();
          }
        }
      });
    }
  }, [persistChatMessagesForUser]);

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
    opts: {
      mediaUrl?: string;
      localUri?: string;
      quality?: MediaQuality;
      kind: "image" | "video";
      caption?: string;
      isViewOnce?: boolean;
    },
  ) => {
    void (async () => {
      const u = userRef.current;
      const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const isVideo = opts.kind === "video";
      const text = opts.caption?.trim() || (opts.isViewOnce ? "🔁 View once" : isVideo ? "🎥 Video" : "📷 Photo");
      const msgType: Message["type"] = isVideo ? "video" : "image";
      const listPreview = inferChatListPreview(msgType, text, opts.mediaUrl ?? opts.localUri);

      const patchMsg = (patch: Partial<Message>) => {
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.map((m) => (m.id === tempId ? { ...m, ...patch } : m)) }
              : c,
          ),
        );
      };

      const showOptimistic = (displayUri: string) => {
        const newMsg: Message = {
          id: tempId,
          text,
          timestamp: Date.now(),
          senderId: "me",
          type: msgType,
          status: "sent",
          mediaUrl: displayUri,
          localMediaUri: opts.localUri ? displayUri : undefined,
          uploadProgress: opts.localUri ? 0 : undefined,
          isViewOnce: opts.isViewOnce,
        };
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: [...c.messages, newMsg], lastMessage: listPreview, lastMessageTime: Date.now() }
              : c,
          ),
        );
      };

      const postMediaMessage = async (remoteUrl: string) => {
        if (!u?.dbId) return;
        const res = await fetch(`${BASE_URL}/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            senderId: u.dbId,
            content: text,
            type: msgType,
            mediaUrl: remoteUrl,
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
          patchMsg({
            id: String(data.message.id),
            status: "delivered",
            mediaUrl: remoteUrl,
            uploadProgress: undefined,
            uploadFailed: false,
          });
        } else {
          patchMsg({ uploadProgress: undefined, uploadFailed: false });
        }
      };

      if (opts.localUri) {
        showOptimistic(opts.localUri);
        if (!u?.dbId) return;
        try {
          let uploadUri = opts.localUri;
          if (!isVideo && !isGifUri(opts.localUri)) {
            uploadUri = await prepareImageForChatUpload(opts.localUri, opts.quality ?? "standard");
          } else {
            uploadUri = await ensureUploadableFileUri(opts.localUri, `chat_${Date.now()}.${imageExtFromUri(opts.localUri)}`);
          }
          const mime = isVideo
            ? (uploadUri.includes(".mov") ? "video/quicktime" : "video/mp4")
            : imageMimeFromUri(uploadUri);
          const ext = isVideo ? (mime.includes("quicktime") ? "mov" : "mp4") : imageExtFromUri(uploadUri);
          const upload = await uploadChatMediaWithProgress({
            uri: uploadUri,
            mime,
            filename: `chat_${Date.now()}.${ext}`,
            sessionToken: u.sessionToken,
            onProgress: (p) => patchMsg({ uploadProgress: p.percent }),
          });
          patchMsg({ mediaUrl: upload.url, uploadProgress: 100 });
          await postMediaMessage(upload.url);
          patchMsg({ uploadProgress: undefined, localMediaUri: undefined });
        } catch (e) {
          patchMsg({ uploadProgress: undefined, uploadFailed: true });
          Alert.alert("Send failed", e instanceof Error ? e.message : "Could not send media.");
        }
        return;
      }

      const remoteUrl = opts.mediaUrl?.trim();
      if (!remoteUrl) return;
      showOptimistic(remoteUrl);
      await postMediaMessage(remoteUrl);
    })();
  }, []);

  const sendAlbumMessage = useCallback((
    chatId: string,
    opts: { urls?: string[]; localUris?: string[]; caption?: string; quality?: MediaQuality },
  ) => {
    void (async () => {
      const u = userRef.current;
      const caption = opts.caption?.trim() ?? "";
      const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
      let activeMsgId = tempId;

      const patchMsg = (patch: Partial<Message>) => {
        const targetId = activeMsgId;
        if (typeof patch.id === "string") activeMsgId = patch.id;
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) => (m.id === targetId ? { ...m, ...patch } : m)),
                }
              : c,
          ),
        );
      };

      const postAlbumMessage = async (remoteUrls: string[]): Promise<boolean> => {
        if (remoteUrls.length < 2) {
          albumSendLog("error", "post skipped — fewer than 2 remote URLs", { chatId, tempId, count: remoteUrls.length });
          return false;
        }
        const content = encodeAlbumMessageContent(remoteUrls, caption);
        const preview = albumChatPreview(remoteUrls.length, caption);
        const displayText = caption || preview;
        if (!u?.dbId) {
          albumSendLog("error", "post skipped — no dbId", { chatId, tempId });
          return false;
        }
        albumSendLog("message_create", "creating album message", {
          chatId,
          tempId,
          imageCount: remoteUrls.length,
          contentBytes: content.length,
        });
        const res = await fetch(`${BASE_URL}/api/chats/${chatId}/messages`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            senderId: u.dbId,
            content,
            type: "album",
            mediaUrl: remoteUrls[0],
          }),
        });
        const data = (await res.json()) as { success?: boolean; message?: { id: number } | string };
        albumSendLog("db_write", "album message API response", {
          chatId,
          tempId,
          status: res.status,
          success: data?.success ?? false,
          hasMessageId:
            !!(data?.message && typeof data.message === "object" && "id" in data.message),
        });
        if (res.status === 403) {
          Alert.alert("Cannot send message", typeof data.message === "string" ? data.message : "Not allowed.");
          albumSendLog("cleanup", "removing optimistic album after 403", { chatId, tempId });
          setChats((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== activeMsgId && m.id !== tempId) } : c)),
          );
          return false;
        }
        const serverId =
          data?.success && data.message && typeof data.message === "object" && "id" in data.message
            ? String(data.message.id)
            : null;
        const finalize = (id: string) => {
          albumSendLog("db_write", "finalizing album with server id", { chatId, tempId, serverId: id });
          setChats((prev) =>
            prev.map((c) => {
              if (c.id !== chatId) return c;
              const local = c.messages.find((m) => m.id === activeMsgId || m.id === tempId || m.id === id);
              const sentAt = local?.timestamp ?? Date.now();
              const finalized: Message = {
                id,
                text: displayText,
                timestamp: sentAt,
                senderId: "me",
                type: "album",
                status: "delivered",
                albumUrls: remoteUrls,
                mediaUrl: remoteUrls[0],
                uploadProgress: undefined,
                uploadFailed: false,
                albumLocalUrls: undefined,
              };
              if (!local) {
                return {
                  ...c,
                  messages: [...c.messages, finalized].sort((a, b) => a.timestamp - b.timestamp),
                  lastMessage: preview,
                  lastMessageTime: sentAt,
                };
              }
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === activeMsgId || m.id === tempId || m.id === id ? { ...m, ...finalized, id } : m,
                ),
                lastMessage: preview,
                lastMessageTime: sentAt,
              };
            }),
          );
          activeMsgId = serverId ?? activeMsgId;
        };
        if (serverId) {
          finalize(serverId);
          return true;
        }
        albumSendLog("error", "album message create failed — no server id", { chatId, tempId, status: res.status });
        return false;
      };

      if (opts.localUris?.length) {
        const localUris = opts.localUris.filter(Boolean);
        if (localUris.length < 2) return;
        const preview = albumChatPreview(localUris.length, caption);
        const displayUris = await ensureAlbumDisplayUris(localUris);
        albumSendLog("render", "optimistic album bubble", {
          chatId,
          tempId,
          imageCount: displayUris.length,
          localReady: displayUris.filter((u) => u.startsWith("file://")).length,
        });
        const newMsg: Message = {
          id: tempId,
          text: caption || preview,
          timestamp: Date.now(),
          senderId: "me",
          type: "album",
          status: "sent",
          mediaUrl: displayUris[0],
          localMediaUri: displayUris[0],
          albumUrls: displayUris,
          albumLocalUrls: displayUris,
          uploadProgress: 0,
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
          const uploaded = await uploadChatImagesBatch({
            uris: displayUris,
            quality: opts.quality ?? "standard",
            sessionToken: u.sessionToken,
            onProgress: (p) => patchMsg({ uploadProgress: p.currentPct }),
          });
          const remoteUrls = uploaded.map((url) => normalizeAlbumMediaUrl(url));
          albumSendLog("upload_finish", "all files uploaded — awaiting DB write", {
            chatId,
            tempId,
            remoteCount: remoteUrls.length,
          });
          patchMsg({ uploadProgress: 99 });
          const posted = await postAlbumMessage(remoteUrls);
          if (!posted) {
            patchMsg({ uploadProgress: undefined, uploadFailed: true });
            Alert.alert("Send failed", "Photos uploaded but the album message could not be saved. Tap to retry.");
            return;
          }
          patchMsg({
            albumUrls: remoteUrls,
            mediaUrl: remoteUrls[0],
            uploadProgress: undefined,
            albumLocalUrls: undefined,
            text: caption || preview,
            uploadFailed: false,
          });
          albumSendLog("cleanup", "album send complete", { chatId, tempId, activeMsgId });
        } catch (e) {
          albumSendLog("error", "album send failed", {
            chatId,
            tempId,
            error: e instanceof Error ? e.message : String(e),
          });
          patchMsg({ uploadProgress: undefined, uploadFailed: true });
          Alert.alert("Send failed", e instanceof Error ? e.message : "Could not send photos.");
        }
        return;
      }

      const urls = (opts.urls ?? []).map((x) => x.trim()).filter(Boolean);
      if (urls.length < 2) return;
      const preview = albumChatPreview(urls.length, caption);
      const newMsg: Message = {
        id: tempId,
        text: caption || preview,
        timestamp: Date.now(),
        senderId: "me",
        type: "album",
        status: "sent",
        mediaUrl: urls[0],
        albumUrls: urls,
      };
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, messages: [...c.messages, newMsg], lastMessage: preview, lastMessageTime: Date.now() }
            : c,
        ),
      );
      await postAlbumMessage(urls);
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
    opts?: { caption?: string; pageCount?: number },
  ) => {
    void (async () => {
      const u = userRef.current;
      const tempId = "tmp_" + Date.now().toString() + Math.random().toString(36).substr(2, 9);
      const displayName = filename.trim() || "Document";
      const { encodeDocumentMessagePayload } = await import("@/lib/documentMessage");
      const content = encodeDocumentMessagePayload({
        filename: displayName,
        caption: opts?.caption,
        pages: opts?.pageCount,
      });
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

      const { registerDocumentUpload, clearDocumentUpload } = await import("@/lib/documentUploadAbort");
      const abort = registerDocumentUpload(tempId);

      const newMsg: Message = {
        id: tempId,
        text: content,
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
      const listPreview = opts?.caption?.trim() || displayName;
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? { ...c, messages: [...c.messages, newMsg], lastMessage: listPreview, lastMessageTime: Date.now() }
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
          signal: abort.signal,
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
            content,
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
          clearDocumentUpload(tempId);
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
        const cancelled = e instanceof Error && e.message.includes("cancelled");
        if (cancelled) {
          setChats((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c)),
          );
        } else {
          patchMsg({ uploadProgress: undefined, uploadFailed: true });
          Alert.alert("Couldn't send document", e instanceof Error ? e.message : "Please try again.");
        }
      } finally {
        clearDocumentUpload(tempId);
      }
    })();
  }, []);

  const cancelDocumentUpload = useCallback((chatId: string, messageId: string) => {
    void (async () => {
      const { cancelDocumentUpload: abortUpload } = await import("@/lib/documentUploadAbort");
      abortUpload(messageId);
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, messages: c.messages.filter((m) => m.id !== messageId) } : c,
        ),
      );
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
    let nextMessages: Message[] = [];
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== chatId) return c;
        const messages = c.messages.map((m) =>
          m.id === messageId ? asDeletedMessage(m) : m,
        );
        nextMessages = messages;
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
    if (dbId && nextMessages.length > 0) {
      messageCacheStoreRef.current = rememberChatMessagesInStore(
        messageCacheStoreRef.current,
        chatId,
        nextMessages as CachedChatMessage[],
      );
      schedulePersistChatMessageCache(dbId, messageCacheStoreRef.current);
    }
    if (dbId) {
      void (async () => {
        try {
          await api(`/chats/${chatId}/messages/${messageId}`, {
            method: "DELETE",
            body: JSON.stringify({ userId: dbId, deleteForEveryone: true }),
          });
          await loadChats(dbId);
        } catch {
          /* keep optimistic tombstone UI */
        }
      })();
    }
  }, [loadChats]);

  const editMessage = useCallback(async (chatId: string, messageId: string, newText: string) => {
    const u = userRef.current;
    const trimmed = newText.trim();
    if (!trimmed) return;
    let prevMsg: Message | undefined;
    setChats((prev) => {
      const chat = prev.find((c) => c.id === chatId);
      prevMsg = chat?.messages.find((m) => m.id === messageId);
      return prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, text: trimmed, isEdited: true, editedAt: Date.now() } : m,
              ),
            }
          : c,
      );
    });
    if (!u?.dbId) return;
    try {
      const data = await api(`/chats/${chatId}/messages/${messageId}`, {
        method: "PUT",
        body: JSON.stringify({ userId: u.dbId, content: trimmed }),
      }) as { success?: boolean; message?: string };
      if (!data.success) {
        throw new Error(data.message ?? "Could not edit message.");
      }
    } catch (err) {
      if (prevMsg) {
        const snapshot = prevMsg;
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: c.messages.map((m) => (m.id === messageId ? snapshot : m)),
                }
              : c,
          ),
        );
      }
      throw err;
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
  const typingPostAtRef = useRef<Record<string, number>>({});
  const setTyping = useCallback((chatId: string) => {
    const u = userRef.current;
    if (!u?.dbId) return;
    const now = Date.now();
    const key = String(chatId);
    if (now - (typingPostAtRef.current[key] ?? 0) < 1500) return;
    typingPostAtRef.current[key] = now;
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

  const createGroup = useCallback((name: string, memberIds: number[], groupAvatarUri?: string) => {
    const u = userRef.current;
    if (!u?.dbId) return;
    const creatorId = u.dbId;
    void (async () => {
      let groupAvatarUrl: string | null = null;
      if (groupAvatarUri) {
        try {
          if (
            groupAvatarUri.startsWith("http://")
            || groupAvatarUri.startsWith("https://")
            || groupAvatarUri.startsWith("data:")
          ) {
            groupAvatarUrl = groupAvatarUri;
          } else {
            const base64 = await FileSystem.readAsStringAsync(groupAvatarUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const mimeType = groupAvatarUri.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
            groupAvatarUrl = `data:${mimeType};base64,${base64}`;
          }
        } catch {
          /* skip avatar on read failure */
        }
      }
      try {
        const data = await api("/chats/group", {
          method: "POST",
          body: JSON.stringify({ creatorId, name, memberIds, groupAvatarUrl }),
        }) as { success?: boolean; chatId?: number };
        if (data?.success && data.chatId) {
          const now = Date.now();
          const avatar = groupAvatarUrl ? (resolvePublicAssetUrl(groupAvatarUrl) ?? groupAvatarUrl) : undefined;
          setChats((prev) => [{
            id: String(data.chatId), name, unreadCount: 0, isGroup: true,
            members: memberIds.map(String), messages: [], isPinned: false, isMuted: false,
            avatar,
            lastMessageTime: now,
          }, ...prev.filter((c) => c.id !== String(data.chatId))]);
          void loadChats(creatorId);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [loadChats]);

  const addStatus = useCallback(async (content: string, type: "text" | "image" | "video", bg?: string, mediaUrl?: string, videoDurationMs?: number | null, editorData?: StoryEditorData) => {
    const u = userRef.current;
    if (!u) return;
    const tempId = Date.now().toString();
    const newStatus: Status = {
      id: tempId, userId: "me", userName: u.name,
      userAvatar: u.avatar,
      content, type, mediaUrl, timestamp: Date.now(), expiresAt: Date.now() + STATUS_LIFETIME_MS, viewed: false,
      editorData,
      backgroundColor: bg ?? "#5B4FE8",
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
            backgroundColor: bg ?? "#5B4FE8",
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

  const keepMessage = useCallback(async (chatId: string, messageId: string) => {
    const u = userRef.current;
    if (!u?.dbId) return;
    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? { ...m, isKept: true } : m,
              ),
            }
          : c,
      ),
    );
    const res = await api(`/chats/${chatId}/messages/${messageId}/keep`, {
      method: "POST",
      body: JSON.stringify({ userId: u.dbId }),
    }) as { success?: boolean };
    if (!res?.success) {
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId ? { ...m, isKept: false } : m,
                ),
              }
            : c,
        ),
      );
      throw new Error("keep_failed");
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
    try {
      const data = await api(`/chats/${chatId}/disappear`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds }),
      }) as { success?: boolean; message?: Record<string, unknown>; disappearAfterSeconds?: number | null };
      if (!data?.success) throw new Error("disappear_update_failed");
      const normalized = data.disappearAfterSeconds ?? (seconds == null ? null : seconds);
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, disappearAfterSeconds: normalized } : c,
        ),
      );
      if (data.message) {
        const u = userRef.current;
        const sysMsg = mapServerRowToMessage(data.message, u?.dbId);
        setChats((prev) =>
          prev.map((c) => {
            if (c.id !== chatId) return c;
            if (c.messages.some((m) => m.id === sysMsg.id)) return c;
            const merged = [...c.messages, sysMsg].sort((a, b) => a.timestamp - b.timestamp);
            return { ...c, messages: merged };
          }),
        );
      } else {
        void loadMessagesRef.current(chatId);
      }
    } catch (err) {
      throw err;
    }
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
        const u = userRef.current;
        if (u?.dbId) {
          try {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const content = encodeLocationPayload({
              v: 1,
              mode: "live",
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              until: sess.untilMs,
              comment: sess.comment,
              stopped: true,
            });
            await fetch(`${BASE_URL}/api/chats/${sess.chatId}/messages/${sess.messageId}`, {
              method: "PUT",
              headers: authHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({
                userId: u.dbId,
                content,
                mediaUrl: buildMapsUrl(loc.coords.latitude, loc.coords.longitude),
              }),
            }).catch(() => {});
            await loadMessages(sess.chatId);
          } catch {
            /* ignore */
          }
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

  const clearCallLogs = useCallback(async (): Promise<boolean> => {
    const uid = userRef.current?.dbId;
    if (!uid) return false;
    try {
      const data = await api(`/calls/user/${uid}`, { method: "DELETE" }) as { success?: boolean };
      if (data.success) {
        setCallLogs([]);
        return true;
      }
    } catch {}
    return false;
  }, []);

  return (
    <AppContext.Provider value={{
      user, isAuthenticated, isInitialized, chatsListReady, chats, statuses, contacts, callLogs,
      setUser, logout, sendMessage, createGroup, markAsRead, markAllAsRead,
      addStatus, deleteMessage, pinChat, muteChat, archiveChat,
      starMessage, keepMessage, forwardMessage, starredMessages, updateAvatar, updateGroupAvatar,
      createDirectChat, loadMessages, applyIncomingMessageHint, loadOlderMessages, refreshChats, clearAllChatHistory,
      deleteChatsFromList, hideChatsInList, hiddenChatIds, chatDeletedAtMap, getChatClearCutoff: getClearCutoff,
      sendImageMessage, sendPreparedMediaMessage, sendAlbumMessage, consumeViewOnceMessage, sendAudioMessage, sendDocumentMessage, cancelDocumentUpload,
      sendContactMessage, setTyping, clearTyping,
      deleteForEveryone, editMessage, reactToMessage, markStatusViewedLocally, deleteStatus,
      blockUser, unblockUser, reportUser, setChatDisappear,
      updateLocationOnServer, startLiveLocationSession, stopLiveLocationSession,
      setActiveChatId, refreshCallLogs, clearCallLogs, typingByChatId, reportRemoteTyping, patchChatMessage, patchChatInList, refreshGroupTranslations,
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
