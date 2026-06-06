import * as Font from "expo-font";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { type Href, Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "@/context/AppContext";
import { AssistantProvider } from "@/context/AssistantContext";
import { CallSessionProvider, useCallSession } from "@/context/CallSessionContext";
import { OngoingCallBanner } from "@/components/OngoingCallBanner";
import { UiPreferencesProvider } from "@/context/UiPreferencesContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AssistantOverlay } from "@/components/AssistantOverlay";
import { getApiUrl } from "@/lib/api";
import { onCallSignal, resolveCallSignal } from "@/lib/callEvents";
import { fetchIncomingCallDetails } from "@/lib/fetchIncomingCallDetails";
import { IncomingCallOverlay, type IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { webrtcAuthHeaders, webrtcFetch } from "@/lib/webrtcApi";
import { useColors } from "@/hooks/useColors";
import {
  ensureVidehNotificationSetup,
  NOTIFICATION_ACTION_ACCEPT_CALL,
  NOTIFICATION_ACTION_DECLINE_CALL,
  NOTIFICATION_ACTION_MARK_READ,
  NOTIFICATION_ACTION_MUTE,
  NOTIFICATION_ACTION_REPLY,
  VIDEH_CALLS_CHANNEL_ID,
} from "@/lib/pushNotifications";
import { dismissIncomingCallNotification, showIncomingCallNotification } from "@/lib/incomingCallNotification";
import { CallWaitingOverlay } from "@/components/CallWaitingOverlay";
import { HeldCallBanner } from "@/components/HeldCallBanner";
import {
  endCallKeep,
  setupCallKeep,
  setCallKeepHandlers,
} from "@/lib/callKeep";
import type { CallKeepHandlerPayload } from "@/lib/callKeepBridge";
import { displayNativeIncomingCall } from "@/lib/videhNativeCallUi";
import { emitChatMessageSignal } from "@/lib/chatMessageEvents";
import { getNotificationActiveChatId } from "@/lib/incomingMessageNotify";
import { dismissChatMessageNotifications } from "@/lib/chatMessageNotification";
import { INCOMING_RING_TIMEOUT_MS } from "@/lib/callConstants";
import { maybePromptDisableBatteryOptimization } from "@/lib/incomingCallBattery";
import { isIncomingCallPushData, presentIncomingCallFromPush } from "@/lib/incomingCallPush";
import {
  claimIncomingCallRing,
  getRingingCallId,
  presentIncomingCallUi,
  startIncomingCallExperience,
  stopIncomingCallExperience,
} from "@/lib/incomingCallExperience";
import { installGlobalErrorHandlers } from "@/lib/globalErrorHandlers";
import {
  registerIncomingCallDismissHandler,
  requestDismissCallSession,
} from "@/lib/incomingCallUiBridge";
import { rejectIncomingCall } from "@/lib/rejectIncomingCall";
import { loadCachedSilenceUnknownCallers } from "@/lib/privacySettings";
import type { Chat } from "@/context/AppContext";

function isKnownCaller(chatId: number, chatList: Chat[]): boolean {
  const chat = chatList.find((c) => c.id === String(chatId));
  if (!chat) return false;
  if (chat.isGroup) return true;
  if (!chat.otherUserId) return false;
  return Boolean(chat.lastMessage) || (chat.messages?.length ?? 0) > 0;
}

async function declineIncomingCallSilently(callId: string, userId: number, sessionToken?: string | null) {
  await rejectIncomingCall({ callId, userId, sessionToken });
  await stopIncomingCallExperience(callId, { force: true });
}

function canPresentIncomingCallUi(): boolean {
  if (Platform.OS === "web") {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
  }
  const state = AppState.currentState;
  return state === "active" || state === "background" || state === "inactive";
}

function toIncomingCallInfo(raw: {
  callId: string;
  channel?: string;
  chatId: number;
  type?: string;
  callerName?: string;
  callerId?: number;
  participantCount?: number;
}): IncomingCallInfo {
  const cid = Number(raw.callerId);
  return {
    callId: String(raw.callId),
    channel: String(raw.channel ?? ""),
    chatId: Number(raw.chatId),
    type: raw.type === "video" ? "video" : "audio",
    callerName: String(raw.callerName ?? "Videh user"),
    participantCount: Number(raw.participantCount ?? 2),
    callerId: Number.isFinite(cid) && cid > 0 ? cid : undefined,
  };
}

SplashScreen.preventAutoHideAsync();
installGlobalErrorHandlers();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

function RootLayoutNav() {
  const { isAuthenticated, isInitialized, user, chats, markAsRead, muteChat, sendMessage, loadMessages } = useApp();
  const colors = useColors();
  const router = useRouter();
  const {
    session: activeCallSession,
    duration: callDuration,
    presentIncomingCall,
    acceptIncoming,
    returnToCallScreen,
    endCall,
    holdActiveCall,
    resumeHeldCall,
    endHeldCall,
    heldSession,
  } = useCallSession();
  const pendingIncomingRef = useRef<IncomingCallInfo | null>(null);
  const offeredCallIdRef = useRef<string | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const activeCallEngineActiveRef = useRef(false);
  const dismissedIncomingCallIdsRef = useRef<Set<string>>(new Set());
  const respondToIncomingCallRef = useRef<(action: "accept" | "decline", msg?: string) => void>(() => {});
  const handledLaunchCallNotificationRef = useRef(false);
  const incomingRingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [callWaiting, setCallWaiting] = useState<IncomingCallInfo | null>(null);

  const clearIncomingAutoEnd = useCallback(() => {
    if (incomingRingTimerRef.current) {
      clearTimeout(incomingRingTimerRef.current);
      incomingRingTimerRef.current = null;
    }
  }, []);

  const dismissIncomingCallUi = useCallback((callId?: string, permanently = false) => {
    clearIncomingAutoEnd();
    if (callId && permanently) {
      dismissedIncomingCallIdsRef.current.add(callId);
      setTimeout(() => dismissedIncomingCallIdsRef.current.delete(callId), 5 * 60_000);
    }
    offeredCallIdRef.current = null;
    pendingIncomingRef.current = null;
    void stopIncomingCallExperience(callId, { force: true });
    requestDismissCallSession(callId);
    setCallWaiting((prev) => (!callId || prev?.callId === callId ? null : prev));
    setIncomingCall((prev) => {
      if (!prev) return null;
      if (callId && prev.callId !== callId) return prev;
      return null;
    });
  }, [clearIncomingAutoEnd]);

  useEffect(
    () => registerIncomingCallDismissHandler((callId, permanent) => dismissIncomingCallUi(callId, permanent)),
    [dismissIncomingCallUi],
  );

  const scheduleIncomingAutoEnd = useCallback((callId: string) => {
    clearIncomingAutoEnd();
    incomingRingTimerRef.current = setTimeout(() => {
      incomingRingTimerRef.current = null;
      if (!user?.dbId) return;
      void declineIncomingCallSilently(callId, user.dbId, user.sessionToken);
      offeredCallIdRef.current = null;
      pendingIncomingRef.current = null;
      setIncomingCall(null);
      if (activeCallSession?.callId === callId && activeCallSession.engineActive) {
        void endCall();
      }
    }, INCOMING_RING_TIMEOUT_MS);
  }, [clearIncomingAutoEnd, user?.dbId, user?.sessionToken, endCall, activeCallSession?.callId, activeCallSession?.engineActive]);

  const offerIncomingCall = useCallback(async (raw: {
    callId: string;
    channel?: string;
    chatId: number;
    type?: string;
    callerName?: string;
    callerId?: number;
    participantCount?: number;
  }) => {
    const next = toIncomingCallInfo(raw);
    if (dismissedIncomingCallIdsRef.current.has(next.callId)) return;
    if (activeCallIdRef.current === next.callId) return;
    if (activeCallSession?.callId === next.callId) return;

    const callPayload = { ...next, callerName: next.callerName };
    const isRepeatOffer = offeredCallIdRef.current === next.callId || !claimIncomingCallRing(next.callId);
    if (isRepeatOffer) {
      if (dismissedIncomingCallIdsRef.current.has(next.callId)) return;
      if (activeCallSession?.callId === next.callId) return;
      offeredCallIdRef.current = next.callId;
      setIncomingCall((prev) => (prev?.callId === next.callId ? prev : callPayload));
      pendingIncomingRef.current = callPayload;
      presentIncomingCallUi(callPayload);
      scheduleIncomingAutoEnd(next.callId);
      return;
    }
    offeredCallIdRef.current = next.callId;

    if (
      activeCallSession?.engineActive
      && !activeCallSession.ringing
      && activeCallSession.callId !== next.callId
    ) {
      setCallWaiting(next);
      presentIncomingCallUi(next);
      void startIncomingCallExperience(next);
      scheduleIncomingAutoEnd(next.callId);
      return;
    }

    const silenceUnknown = await loadCachedSilenceUnknownCallers();
    if (silenceUnknown && user?.dbId && !isKnownCaller(Number(next.chatId), chats)) {
      await declineIncomingCallSilently(next.callId, user.dbId, user.sessionToken);
      return;
    }

    const appActive = AppState.currentState === "active";
    if (!appActive) {
      displayNativeIncomingCall({
        callId: next.callId,
        callerName: next.callerName,
        isVideo: next.type === "video",
      });
    }

    presentIncomingCallUi(next);
    pendingIncomingRef.current = callPayload;
    if (Platform.OS !== "web" && appActive) {
      presentIncomingCall(callPayload);
    } else {
      setIncomingCall((prev) => (prev?.callId === next.callId ? prev : callPayload));
    }

    void startIncomingCallExperience(callPayload);
    if (Platform.OS !== "web" && !appActive) {
      void showIncomingCallNotification(callPayload);
    }

    scheduleIncomingAutoEnd(next.callId);
  }, [
    activeCallSession?.callId,
    activeCallSession?.engineActive,
    activeCallSession?.ringing,
    chats,
    scheduleIncomingAutoEnd,
    presentIncomingCall,
    user?.dbId,
    user?.sessionToken,
  ]);

  useEffect(() => {
    activeCallIdRef.current = activeCallSession?.callId ?? null;
    activeCallEngineActiveRef.current = Boolean(
      activeCallSession?.engineActive && !activeCallSession?.ringing,
    );
  }, [activeCallSession?.callId, activeCallSession?.engineActive, activeCallSession?.ringing]);

  // Navigate to chat when notification is tapped
  useEffect(() => {
    if (Platform.OS === "web") return;
    ensureVidehNotificationSetup().catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      const actionId = response.actionIdentifier;
      const chatId = data?.chatId ? String(data.chatId) : "";
      if (actionId === NOTIFICATION_ACTION_MARK_READ && chatId && isAuthenticated) {
        markAsRead(chatId);
        void dismissChatMessageNotifications(chatId);
        return;
      }
      if (actionId === NOTIFICATION_ACTION_MUTE && chatId && isAuthenticated) {
        muteChat(chatId);
        void dismissChatMessageNotifications(chatId);
        return;
      }
      if (actionId === NOTIFICATION_ACTION_REPLY && chatId && isAuthenticated) {
        const replyText = String(response.userText ?? "").trim();
        if (replyText) {
          sendMessage(chatId, replyText);
          markAsRead(chatId);
        }
        void dismissChatMessageNotifications(chatId);
        return;
      }
      if (
        (actionId === NOTIFICATION_ACTION_ACCEPT_CALL || actionId === NOTIFICATION_ACTION_DECLINE_CALL)
        && data?.callId
        && user?.dbId
      ) {
        clearIncomingAutoEnd();
        const action = actionId === NOTIFICATION_ACTION_ACCEPT_CALL ? "accept" : "decline";
        if (action === "decline") {
          const callId = String(data.callId);
          dismissIncomingCallUi(callId, true);
          void rejectIncomingCall({ callId, userId: user.dbId, sessionToken: user.sessionToken });
          requestDismissCallSession(callId);
          return;
        }
        void (async () => {
          const callId = String(data.callId);
          const hydrated =
            data.channel && Number(data.chatId)
              ? toIncomingCallInfo({
                  callId,
                  channel: String(data.channel),
                  chatId: Number(data.chatId),
                  type: String(data.type ?? "audio"),
                  callerName: String(data.callerName ?? "Videh user"),
                  participantCount: 2,
                })
              : await fetchIncomingCallDetails(callId, user.dbId, user.sessionToken);
          if (!hydrated) return;
          clearIncomingAutoEnd();
          dismissIncomingCallUi(hydrated.callId, false);
          activeCallIdRef.current = hydrated.callId;
          await acceptIncoming(hydrated);
        })();
        return;
      }
      if (data?.callId && isAuthenticated) {
        void fetch(`${getApiUrl()}/api/webrtc/calls/${data.callId}/status?userId=${user?.dbId ?? ""}`)
          .then((res) => res.json())
          .then((payload: { success?: boolean; ended?: boolean; call?: IncomingCallInfo }) => {
            if (payload.ended) return;
            const call = payload.call;
            if (!call) return;
            void offerIncomingCall({
              callId: String(data.callId),
              channel: String(data.channel ?? ""),
              chatId: Number(data.chatId),
              type: String(data.type ?? "audio"),
              callerName: String(data.callerName ?? "Videh user"),
            });
          })
          .catch(() => {});
        return;
      }
      if (data?.chatId && isAuthenticated) {
        router.push({ pathname: "/chat/[id]", params: { id: data.chatId } });
      }
    });
    return () => sub.remove();
  }, [
    isAuthenticated,
    markAsRead,
    muteChat,
    router,
    sendMessage,
    user?.dbId,
    user?.sessionToken,
    scheduleIncomingAutoEnd,
    presentIncomingCall,
    acceptIncoming,
  ]);

  // Wait for AsyncStorage to load before deciding where to route
  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) {
      router.replace("/auth/phone");
    }
  }, [isAuthenticated, isInitialized]);

  useEffect(() => {
    if (!isAuthenticated || Platform.OS !== "android") return;
    void maybePromptDisableBatteryOptimization();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !user?.dbId) return;
    let cancelled = false;
    const pollMs = () => {
      const state = AppState.currentState;
      return state === "active" ? 1500 : 800;
    };
    const poll = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/webrtc/calls/incoming/${user.dbId}`, {
          headers: webrtcAuthHeaders(user.sessionToken),
        });
        const data = await res.json() as { success?: boolean; calls?: any[] };
        if (cancelled) return;
        const next = data.calls?.[0] ?? null;
        if (!next) {
          const activeId = getRingingCallId() ?? offeredCallIdRef.current ?? activeCallIdRef.current;
          if (!activeId) {
            dismissIncomingCallUi();
            return;
          }
          try {
            const statusRes = await fetch(
              `${getApiUrl()}/api/webrtc/calls/${activeId}/status?userId=${user.dbId}`,
              { headers: webrtcAuthHeaders(user.sessionToken) },
            );
            const statusData = (await statusRes.json()) as { success?: boolean; ended?: boolean };
            if (
              (!statusData.success || statusData.ended)
              && !(activeCallIdRef.current === activeId && activeCallEngineActiveRef.current)
            ) {
              dismissIncomingCallUi(activeId, true);
            }
          } catch {
            /* keep ringing UI if status check fails */
          }
          return;
        }
        const pollCallId = String(next.callId ?? "");
        if (dismissedIncomingCallIdsRef.current.has(pollCallId)) return;
        if (activeCallSession?.callId === pollCallId) return;
        await offerIncomingCall({
          callId: next.callId,
          channel: next.channel,
          chatId: next.chatId,
          type: next.type,
          callerName: next.callerName ?? "Videh user",
          callerId: next.callerId,
          participantCount: next.participantCount,
        });
      } catch {}
    };
    void poll();
    let timer = setInterval(poll, pollMs());
    const appStateSub = AppState.addEventListener("change", () => {
      clearInterval(timer);
      timer = setInterval(poll, pollMs());
      if (AppState.currentState === "active" || AppState.currentState === "background") {
        void poll();
      }
    });
    const unsubCall = onCallSignal((payload) => {
      const signal = resolveCallSignal(payload as Record<string, unknown>);
      const action = signal.action ?? "";
      const callId = signal.callId ?? "";
      if (action === "ringing" && callId && user.dbId) {
        if (dismissedIncomingCallIdsRef.current.has(callId)) return;
        if (activeCallIdRef.current === callId) return;
        const callInfo: IncomingCallInfo = {
          callId,
          channel: String(signal.channel ?? ""),
          chatId: Number(signal.chatId ?? 0),
          type: signal.type === "video" ? "video" : "audio",
          callerName: String(signal.callerName ?? "Videh user"),
          participantCount: Number(signal.participantCount ?? 2),
          callerId: signal.callerId,
        };
        void offerIncomingCall(callInfo);
      }
      if (action === "accepted" && callId) {
        offeredCallIdRef.current = null;
        void stopIncomingCallExperience(callId);
      }
      if (action === "declined" || action === "ended" || action === "missed" || action === "busy" || action === "cancelled") {
        if (callId) {
          dismissedIncomingCallIdsRef.current.add(callId);
          offeredCallIdRef.current = null;
          pendingIncomingRef.current = null;
          clearIncomingAutoEnd();
          requestDismissCallSession(callId);
          dismissIncomingCallUi(callId, true);
          void loadMessages(String(signal.chatId ?? payload.chatId ?? ""));
        } else {
          dismissIncomingCallUi(undefined, true);
        }
      }
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      appStateSub.remove();
      unsubCall();
      clearIncomingAutoEnd();
      offeredCallIdRef.current = null;
      void stopIncomingCallExperience();
    };
  }, [isAuthenticated, user?.dbId, user?.sessionToken, activeCallSession?.callId, offerIncomingCall, dismissIncomingCallUi]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && state !== "background") return;
      const pending = pendingIncomingRef.current;
      if (pending && canPresentIncomingCallUi()) {
        pendingIncomingRef.current = null;
        if (Platform.OS !== "web") {
          presentIncomingCall(pending);
        } else {
          setIncomingCall(pending);
        }
        void startIncomingCallExperience(pending);
        scheduleIncomingAutoEnd(pending.callId);
      }
    });
    return () => sub.remove();
  }, [scheduleIncomingAutoEnd, presentIncomingCall]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        const isCall = isIncomingCallPushData(data);
        if (isCall && data && AppState.currentState !== "active") {
          void presentIncomingCallFromPush(data, { scheduleLocalNotification: false });
        }
        const isChatMessage =
          data?.notificationKind === "chat_message"
          || data?.kind === "message";
        const inOpenChat =
          isChatMessage
          && data?.chatId != null
          && AppState.currentState === "active"
          && getNotificationActiveChatId() === String(data.chatId);
        if (inOpenChat) {
          emitChatMessageSignal({
            chatId: String(data.chatId),
            messageId: data.messageId != null ? String(data.messageId) : undefined,
            body: notification.request.content.body ?? undefined,
            senderName: String(data.senderName ?? notification.request.content.title ?? ""),
            senderId: data.senderId != null ? String(data.senderId) : undefined,
          });
        }
        return {
          shouldShowAlert: !inOpenChat,
          shouldPlaySound: !inOpenChat,
          shouldShowBanner: !inOpenChat,
          shouldShowList: !inOpenChat,
          shouldSetBadge: !isCall && !inOpenChat,
        };
      },
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated || handledLaunchCallNotificationRef.current) return;
    void (async () => {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (!last) return;
      handledLaunchCallNotificationRef.current = true;
      const data = last.notification.request.content.data as Record<string, unknown> | undefined;
      if (!data?.callId) return;
      const actionId = last.actionIdentifier;
      if (actionId && actionId !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      void offerIncomingCall({
        callId: String(data.callId),
        channel: String(data.channel ?? ""),
        chatId: Number(data.chatId),
        type: String(data.type ?? "audio"),
        callerName: String(data.callerName ?? "Videh user"),
        callerId: Number(data.callerId) > 0 ? Number(data.callerId) : undefined,
      });
    })();
  }, [isAuthenticated, offerIncomingCall]);

  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (!data) return;
      const isChatMessage =
        data.notificationKind === "chat_message"
        || data.kind === "message";
      if (isChatMessage && data.chatId) {
        const chatId = String(data.chatId);
        emitChatMessageSignal({
          chatId,
          messageId: data.messageId != null ? String(data.messageId) : undefined,
          body: notification.request.content.body ?? undefined,
          senderName: String(data.senderName ?? notification.request.content.title ?? ""),
          senderId: data.senderId != null ? String(data.senderId) : undefined,
        });
        if (AppState.currentState === "active" && getNotificationActiveChatId() === chatId) {
          void dismissChatMessageNotifications(chatId);
        }
        return;
      }
      const isCall = data.kind === "call" || data.notificationKind === "incoming_call";
      if (!isCall || !data.callId) return;
      const info = toIncomingCallInfo({
        callId: String(data.callId),
        channel: String(data.channel ?? ""),
        chatId: Number(data.chatId),
        type: String(data.type ?? "audio"),
        callerName: String(data.callerName ?? "Videh user"),
        participantCount: 2,
      });
      if (activeCallIdRef.current === info.callId) return;
      if (dismissedIncomingCallIdsRef.current.has(info.callId)) return;
      if (activeCallSession?.callId === info.callId) return;
      void offerIncomingCall(info);
    });
    return () => sub.remove();
  }, [isAuthenticated, activeCallSession?.callId, offerIncomingCall, loadMessages]);

  const respondToIncomingCall = async (action: "accept" | "decline", declineMessage?: string) => {
    if (!incomingCall || !user?.dbId) return;
    const call = incomingCall;
    if (action === "decline") {
      dismissIncomingCallUi(call.callId, true);
      await rejectIncomingCall({
        callId: call.callId,
        userId: user.dbId,
        sessionToken: user.sessionToken,
        declineMessage,
      });
      requestDismissCallSession(call.callId);
      void loadMessages(String(call.chatId));
      return;
    }
    dismissIncomingCallUi(call.callId, false);
    try {
      activeCallIdRef.current = call.callId;
      await acceptIncoming(call);
    } catch {
      /* keep UI responsive if ringtone/network fails */
    }
  };

  respondToIncomingCallRef.current = (action, msg) => {
    void respondToIncomingCall(action, msg);
  };

  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;
    void setupCallKeep();
    setCallKeepHandlers({
      onAnswer: ({ callId }: CallKeepHandlerPayload) => {
        if (!callId || !user?.dbId) return;
        void (async () => {
          clearIncomingAutoEnd();
          await stopIncomingCallExperience(callId);
          const waiting = callWaiting;
          if (waiting?.callId === callId) {
            setCallWaiting(null);
            await holdActiveCall();
            activeCallIdRef.current = callId;
            await acceptIncoming(waiting);
            return;
          }
          if (incomingCall?.callId === callId) {
            respondToIncomingCallRef.current("accept");
            return;
          }
          const hydrated = user?.dbId
            ? await fetchIncomingCallDetails(callId, user.dbId, user.sessionToken)
            : null;
          if (hydrated) {
            dismissIncomingCallUi(hydrated.callId, false);
            activeCallIdRef.current = hydrated.callId;
            await acceptIncoming(hydrated);
          }
        })();
      },
      onEnd: ({ callId }: CallKeepHandlerPayload) => {
        if (!callId) return;
        if (callWaiting?.callId === callId) {
          clearIncomingAutoEnd();
          offeredCallIdRef.current = null;
          void stopIncomingCallExperience(callId);
          setCallWaiting(null);
          if (user?.dbId) void declineIncomingCallSilently(callId, user.dbId, user.sessionToken);
          endCallKeep(callId, "declined");
          return;
        }
        if (incomingCall?.callId === callId) {
          respondToIncomingCallRef.current("decline");
          return;
        }
        if (activeCallSession?.callId === callId) void endCall();
      },
    });
    return () => setCallKeepHandlers({});
  }, [
    isAuthenticated,
    user?.dbId,
    user?.sessionToken,
    callWaiting,
    incomingCall,
    activeCallSession?.callId,
    clearIncomingAutoEnd,
    holdActiveCall,
    presentIncomingCall,
    acceptIncoming,
    offerIncomingCall,
    endCall,
  ]);

  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;
    const handleDeepLink = (url: string | null) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const host = parsed.hostname ?? parsed.path?.replace(/^\//, "");
      if (host === "join-call") {
        const token = parsed.queryParams?.token;
        if (!token) return;
        router.push({ pathname: "/join-call", params: { token: String(token) } } as unknown as Href);
        return;
      }
      if (host !== "call") return;
      const qp = parsed.queryParams ?? {};
      const callId = qp.callId ? String(qp.callId) : "";
      const incoming = qp.incoming === "1" || qp.incoming === 1;
      const pathChatId = String(parsed.path ?? "").replace(/^\//, "").split("/")[0];
      const chatId = Number(pathChatId) || Number(qp.chatId ?? 0);
      if (!callId || !incoming) return;
      if (dismissedIncomingCallIdsRef.current.has(callId)) return;
      void offerIncomingCall({
        callId,
        channel: String(qp.channel ?? ""),
        chatId: Number.isFinite(chatId) ? chatId : Number(qp.chatId ?? 0),
        type: String(qp.type ?? "audio"),
        callerName: String(qp.name ?? "Videh user"),
      });
    };
    void Linking.getInitialURL().then(handleDeepLink);
    const sub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, [isAuthenticated, router, offerIncomingCall]);

  return (
    <>
      <StatusBar style="light" backgroundColor={colors.headerBg} translucent={false} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth/phone" options={{ headerShown: false }} />
        <Stack.Screen name="auth/otp" options={{ headerShown: false }} />
        <Stack.Screen name="auth/two-step-login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/profile" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="chat-info/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="disappearing-messages/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="call" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="join-call" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="contacts" options={{ headerShown: false }} />
        <Stack.Screen name="status/view" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="status/viewers" options={{ headerShown: false }} />
        <Stack.Screen name="new-group" options={{ headerShown: false }} />
        <Stack.Screen name="starred" options={{ headerShown: false }} />
        <Stack.Screen name="scheduled/[chatId]" options={{ headerShown: false }} />
        <Stack.Screen name="khata/[chatId]" options={{ headerShown: false }} />
        <Stack.Screen name="settings/sos" options={{ headerShown: false }} />
        <Stack.Screen name="settings/two-step" options={{ headerShown: false }} />
        <Stack.Screen name="settings/change-number" options={{ headerShown: false }} />
        <Stack.Screen name="settings/storage" options={{ headerShown: false }} />
        <Stack.Screen name="settings/accessibility" options={{ headerShown: false }} />
        <Stack.Screen name="settings/language" options={{ headerShown: false }} />
        <Stack.Screen name="settings/assistant" options={{ headerShown: false }} />
        <Stack.Screen name="settings/privacy" options={{ headerShown: false }} />
        <Stack.Screen name="settings/account" options={{ headerShown: false }} />
        <Stack.Screen name="settings/notifications" options={{ headerShown: false }} />
        <Stack.Screen name="settings/premium-sounds" options={{ headerShown: false }} />
        <Stack.Screen name="settings/chat-sound/[chatId]" options={{ headerShown: false }} />
        <Stack.Screen name="settings/chats" options={{ headerShown: false }} />
        <Stack.Screen name="settings/theme" options={{ headerShown: false }} />
        <Stack.Screen name="settings/advanced-theme" options={{ headerShown: false }} />
        <Stack.Screen name="settings/chat-theme" options={{ headerShown: false }} />
        <Stack.Screen name="settings/help" options={{ headerShown: false }} />
        <Stack.Screen name="settings/qr-code" options={{ headerShown: false }} />
        <Stack.Screen name="settings/last-seen-online" options={{ headerShown: false }} />
        <Stack.Screen name="broadcasts/index" options={{ headerShown: false }} />
        <Stack.Screen name="reels" options={{ headerShown: false }} />
      </Stack>
      {incomingCall ? (
        <IncomingCallOverlay
          call={incomingCall}
          onAccept={() => { void respondToIncomingCall("accept"); }}
          onDecline={() => { void respondToIncomingCall("decline"); }}
          onDeclineWithMessage={(text) => { void respondToIncomingCall("decline", text); }}
        />
      ) : null}
      {callWaiting && activeCallSession?.engineActive && !activeCallSession.ringing ? (
        <CallWaitingOverlay
          visible
          currentContactName={activeCallSession.contactName}
          incoming={callWaiting}
          onHoldAndAnswer={async () => {
            const waiting = callWaiting;
            if (!waiting || !user?.dbId) return;
            setCallWaiting(null);
          clearIncomingAutoEnd();
          offeredCallIdRef.current = null;
          await stopIncomingCallExperience(waiting.callId);
          await holdActiveCall();
            activeCallIdRef.current = waiting.callId;
            await acceptIncoming(waiting);
          }}
          onEndAndAnswer={async () => {
            const waiting = callWaiting;
            setCallWaiting(null);
            clearIncomingAutoEnd();
            offeredCallIdRef.current = null;
            await stopIncomingCallExperience(waiting?.callId);
            await endCall();
            if (waiting) {
              activeCallIdRef.current = waiting.callId;
              await acceptIncoming(waiting);
            }
          }}
          onDecline={async () => {
            if (!callWaiting || !user?.dbId) return;
            clearIncomingAutoEnd();
            offeredCallIdRef.current = null;
            await declineIncomingCallSilently(callWaiting.callId, user.dbId, user.sessionToken);
            setCallWaiting(null);
          }}
        />
      ) : null}
      {activeCallSession?.minimized && activeCallSession.engineActive && !activeCallSession.ringing ? (
        <OngoingCallBanner
          contactName={activeCallSession.contactName}
          isVideo={activeCallSession.isVideo}
          durationLabel={(() => {
            const m = Math.floor(callDuration / 60).toString().padStart(2, "0");
            const s = (callDuration % 60).toString().padStart(2, "0");
            return `${m}:${s}`;
          })()}
          onReturn={returnToCallScreen}
          onEnd={() => void endCall()}
        />
      ) : null}
      {heldSession?.onHold ? (
        <HeldCallBanner
          contactName={heldSession.contactName}
          isVideo={heldSession.isVideo}
          onResume={() => void resumeHeldCall()}
          onEnd={() => void endHeldCall()}
        />
      ) : null}
      <AssistantOverlay />
    </>
  );
}

export default function RootLayout() {
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    Font.loadAsync({
      Inter_400Regular: require("../assets/fonts/Inter_400Regular.ttf"),
      Inter_500Medium: require("../assets/fonts/Inter_500Medium.ttf"),
      Inter_600SemiBold: require("../assets/fonts/Inter_600SemiBold.ttf"),
      Inter_700Bold: require("../assets/fonts/Inter_700Bold.ttf"),
    })
      .catch(() => {})
      .finally(() => {
        setFontsReady(true);
        SplashScreen.hideAsync();
      });
  }, []);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <UiPreferencesProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <AppProvider>
                  <CallSessionProvider>
                    <AssistantProvider>
                      <RootLayoutNav />
                    </AssistantProvider>
                  </CallSessionProvider>
                </AppProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </UiPreferencesProvider>
    </SafeAreaProvider>
  );
}

