import { AppState, Platform } from "react-native";
import { emitChatMessageSignal } from "./chatMessageEvents";
import { agentDebugLog } from "./agentDebugLog";
import { showChatMessageNotification } from "./chatMessageNotification";
import { playInAppSoundAsset } from "./playInAppSound";
import { getEffectiveMessageSound, getSoundPrefs } from "./soundPrefs";

export type NotificationChatSnapshot = {
  id: string;
  name: string;
  avatar?: string;
  lastMessage?: string;
  isGroup: boolean;
  isMuted?: boolean;
};

let chatsSnapshot: NotificationChatSnapshot[] = [];
let activeChatId: string | null = null;
let viewerDbId: number | null = null;
const recentNotifyAt = new Map<string, number>();

const DEDUPE_MS = 4000;

export function setNotificationRuntimeState(state: {
  chats: NotificationChatSnapshot[];
  activeChatId: string | null;
  viewerDbId?: number | null;
}): void {
  chatsSnapshot = state.chats;
  activeChatId = state.activeChatId;
  if (state.viewerDbId !== undefined) viewerDbId = state.viewerDbId;
}

export function isOwnOutgoingChatMessage(
  senderId: string | number | undefined | null,
  dbId: number | undefined | null = viewerDbId,
): boolean {
  if (senderId == null || dbId == null) return false;
  return String(senderId) === String(dbId);
}

export function setNotificationActiveChatId(chatId: string | null): void {
  activeChatId = chatId;
}

export function getNotificationActiveChatId(): string | null {
  return activeChatId;
}

function notifyDedupeKey(chatId: string, messageId?: string): string {
  return `${chatId}:${messageId ?? "latest"}`;
}

function shouldDeliverNotification(chatId: string, messageId?: string): boolean {
  const key = notifyDedupeKey(chatId, messageId);
  const now = Date.now();
  const prev = recentNotifyAt.get(key);
  if (prev != null && now - prev < DEDUPE_MS) return false;
  recentNotifyAt.set(key, now);
  return true;
}

function findChat(chatId: string): NotificationChatSnapshot | undefined {
  return chatsSnapshot.find((c) => c.id === String(chatId));
}

export type DeliverIncomingMessageOpts = {
  chatId: string;
  messageId?: string;
  senderId?: string;
  senderName?: string;
  body?: string;
  avatarUrl?: string | null;
  isGroup?: boolean;
  /** Refresh chat list before reading snapshot (SSE path). */
  reloadChats?: () => Promise<void>;
};

/** Show a local notification with premium per-chat sound (replaces default FCM tone). */
export async function deliverPremiumChatMessageNotification(
  opts: DeliverIncomingMessageOpts,
): Promise<boolean> {
  if (isOwnOutgoingChatMessage(opts.senderId)) {
    agentDebugLog(
      "incomingMessageNotify.ts:deliver",
      "skipped own outgoing message",
      { chatId: opts.chatId, senderId: opts.senderId },
      "H1",
      "post-fix",
    );
    return false;
  }

  if (Platform.OS === "web") {
    if (opts.reloadChats) {
      try {
        await opts.reloadChats();
      } catch {
        /* optional */
      }
    }
    const chat = findChat(opts.chatId);
    if (chat?.isMuted) return false;
    if (AppState.currentState === "active" && activeChatId === opts.chatId) return false;
    if (!shouldDeliverNotification(opts.chatId, opts.messageId)) return false;
    const { showWebBrowserNotification } = await import("./web/webBrowserNotify");
    const title = opts.senderName?.trim() || chat?.name || "Videh";
    const body = opts.body?.trim() || chat?.lastMessage?.trim() || "Message";
    showWebBrowserNotification(title, body, {
      tag: `chat-${opts.chatId}`,
      data: { chatId: opts.chatId },
      onClick: () => {
        if (typeof window !== "undefined") {
          window.location.hash = "";
          window.dispatchEvent(new CustomEvent("videh-open-chat", { detail: { chatId: opts.chatId } }));
        }
      },
    });
    return true;
  }

  if (opts.reloadChats) {
    try {
      await opts.reloadChats();
    } catch {
      /* list refresh optional */
    }
  }

  const chat = findChat(opts.chatId);
  if (chat?.isMuted) {
    agentDebugLog(
      "incomingMessageNotify.ts:deliver",
      "skipped muted chat",
      { chatId: opts.chatId },
      "H1",
      "post-fix",
    );
    return false;
  }

  const appActive = AppState.currentState === "active";
  if (appActive && activeChatId === opts.chatId) {
    emitChatMessageSignal({
      chatId: opts.chatId,
      messageId: opts.messageId,
      body: opts.body,
      senderName: opts.senderName,
      senderId: undefined,
    });
    agentDebugLog(
      "incomingMessageNotify.ts:deliver",
      "skipped active chat (signal emitted)",
      { chatId: opts.chatId },
      "H1",
      "post-fix",
    );
    return false;
  }

  if (!shouldDeliverNotification(opts.chatId, opts.messageId)) {
    agentDebugLog(
      "incomingMessageNotify.ts:deliver",
      "skipped dedupe",
      { chatId: opts.chatId, messageId: opts.messageId },
      "H1",
      "post-fix",
    );
    return false;
  }

  const senderName = opts.senderName?.trim() || chat?.name || "Videh";
  const body = opts.body?.trim() || chat?.lastMessage?.trim() || "Message";
  const isGroup = opts.isGroup ?? chat?.isGroup ?? false;

  if (appActive) {
    const prefs = await getSoundPrefs();
    const soundId = getEffectiveMessageSound(prefs, opts.chatId, isGroup);
    void playInAppSoundAsset(soundId);
  }

  await showChatMessageNotification({
    chatId: opts.chatId,
    messageId: opts.messageId,
    senderId: opts.senderId,
    senderName,
    body,
    avatarUrl: opts.avatarUrl ?? chat?.avatar ?? null,
    isGroup,
  });

  agentDebugLog(
    "incomingMessageNotify.ts:deliver",
    "premium notification delivered",
    { chatId: opts.chatId, messageId: opts.messageId, isGroup, appState: AppState.currentState },
    "H1",
    "post-fix",
  );
  return true;
}
