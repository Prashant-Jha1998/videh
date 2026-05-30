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
import { onCallSignal } from "@/lib/callEvents";
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
import { dismissChatMessageNotifications } from "@/lib/chatMessageNotification";
import { INCOMING_RING_TIMEOUT_MS } from "@/lib/callConstants";
import {
  claimIncomingCallRing,
  presentIncomingCallUi,
  startIncomingCallExperience,
  stopIncomingCallExperience,
} from "@/lib/incomingCallExperience";
import { installGlobalErrorHandlers } from "@/lib/globalErrorHandlers";
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
  await stopIncomingCallExperience(callId);
  await fetch(`${getApiUrl()}/api/webrtc/calls/${callId}/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify({ userId, action: "decline" }),
  }).catch(() => {});
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
  participantCount?: number;
}): IncomingCallInfo {
  return {
    callId: String(raw.callId),
    channel: String(raw.channel ?? ""),
    chatId: Number(raw.chatId),
    type: raw.type === "video" ? "video" : "audio",
    callerName: String(raw.callerName ?? "Videh user"),
    participantCount: Number(raw.participantCount ?? 2),
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

  const scheduleIncomingAutoEnd = useCallback((callId: string) => {
    clearIncomingAutoEnd();
    incomingRingTimerRef.current = setTimeout(() => {
      incomingRingTimerRef.current = null;
      if (!user?.dbId) return;
      void declineIncomingCallSilently(callId, user.dbId, user.sessionToken);
      offeredCallIdRef.current = null;
      pendingIncomingRef.current = null;
      setIncomingCall(null);
      if (activeCallIdRef.current === callId) {
        void endCall();
      }
    }, INCOMING_RING_TIMEOUT_MS);
  }, [clearIncomingAutoEnd, user?.dbId, user?.sessionToken, endCall]);

  const offerIncomingCall = useCallback(async (raw: {
    callId: string;
    channel?: string;
    chatId: number;
    type?: string;
    callerName?: string;
    participantCount?: number;
  }) => {
    const next = toIncomingCallInfo(raw);
    if (activeCallIdRef.current === next.callId) return;

    const callPayload = { ...next, callerName: next.callerName };
    const isRepeatOffer = offeredCallIdRef.current === next.callId || !claimIncomingCallRing(next.callId);
    if (isRepeatOffer) {
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

    displayNativeIncomingCall({
      callId: next.callId,
      callerName: next.callerName,
      isVideo: next.type === "video",
    });

    presentIncomingCallUi(next);
    setIncomingCall((prev) => (prev?.callId === next.callId ? prev : callPayload));
    pendingIncomingRef.current = callPayload;

    void startIncomingCallExperience(callPayload);
    if (Platform.OS !== "web") {
      void showIncomingCallNotification(callPayload);
    }

    scheduleIncomingAutoEnd(next.callId);
  }, [
    activeCallSession?.engineActive,
    activeCallSession?.ringing,
    chats,
    scheduleIncomingAutoEnd,
    user?.dbId,
    user?.sessionToken,
  ]);

  useEffect(() => {
    activeCallIdRef.current = activeCallSession?.callId ?? null;
  }, [activeCallSession?.callId]);

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
          void stopIncomingCallExperience(String(data.callId));
        }
        void (async () => {
          try {
            await fetch(`${getApiUrl()}/api/webrtc/calls/${data.callId}/respond`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
              },
              body: JSON.stringify({ userId: user.dbId, action }),
            });
            if (action === "accept") {
              const call = toIncomingCallInfo({
                callId: String(data.callId),
                channel: String(data.channel ?? ""),
                chatId: Number(data.chatId),
                type: String(data.type ?? "audio"),
                callerName: String(data.callerName ?? "Videh user"),
                participantCount: 2,
              });
              setIncomingCall(null);
              presentIncomingCall(call);
              await acceptIncoming();
            }
          } catch {
            /* ignore */
          }
        })();
        return;
      }
      if (data?.callId && isAuthenticated) {
        void fetch(`${getApiUrl()}/api/webrtc/calls/${data.callId}/status?userId=${user?.dbId ?? ""}`)
          .then((res) => res.json())
          .then((payload: { success?: boolean; call?: IncomingCallInfo }) => {
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
    if (!isAuthenticated || !user?.dbId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/webrtc/calls/incoming/${user.dbId}`, {
          headers: webrtcAuthHeaders(user.sessionToken),
        });
        const data = await res.json() as { success?: boolean; calls?: any[] };
        if (cancelled) return;
        const next = data.calls?.[0] ?? null;
        if (!next) {
          pendingIncomingRef.current = null;
          clearIncomingAutoEnd();
          offeredCallIdRef.current = null;
          setIncomingCall((prev) => {
            if (prev) void stopIncomingCallExperience(prev.callId);
            return null;
          });
          return;
        }
        await offerIncomingCall({
          callId: next.callId,
          channel: next.channel,
          chatId: next.chatId,
          type: next.type,
          callerName: next.callerName ?? "Videh user",
          participantCount: next.participantCount,
        });
      } catch {}
    };
    void poll();
    const timer = setInterval(poll, 2500);
    const unsubCall = onCallSignal((payload) => {
      const action = String(payload.action ?? "");
      const callId = payload.callId ? String(payload.callId) : "";
      if (action === "ringing" && callId && user.dbId) {
        const callInfo: IncomingCallInfo = {
          callId,
          channel: String(payload.channel ?? ""),
          chatId: Number(payload.chatId),
          type: payload.type === "video" ? "video" : "audio",
          callerName: String(payload.callerName ?? "Videh user"),
          participantCount: Number(payload.participantCount ?? 2),
        };
        void offerIncomingCall(callInfo);
      }
      if (action === "accepted" && callId) {
        offeredCallIdRef.current = null;
        void stopIncomingCallExperience(callId);
      }
      if (action === "declined" || action === "ended" || action === "missed" || action === "busy") {
        clearIncomingAutoEnd();
        offeredCallIdRef.current = null;
        if (callId) void stopIncomingCallExperience(callId);
        setCallWaiting((prev) => (prev?.callId === callId ? null : prev));
        setIncomingCall((prev) => {
          if (!prev) return prev;
          if (callId && prev.callId !== callId) return prev;
          void loadMessages(String(prev.chatId));
          return null;
        });
      }
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubCall();
      clearIncomingAutoEnd();
      offeredCallIdRef.current = null;
      void stopIncomingCallExperience();
    };
  }, [isAuthenticated, user?.dbId, user?.sessionToken, chats, loadMessages, activeCallSession?.callId, offerIncomingCall, clearIncomingAutoEnd]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && state !== "background") return;
      const pending = pendingIncomingRef.current;
      if (pending && canPresentIncomingCallUi()) {
        pendingIncomingRef.current = null;
        setIncomingCall(pending);
        void startIncomingCallExperience(pending);
        scheduleIncomingAutoEnd(pending.callId);
      }
    });
    return () => sub.remove();
  }, [scheduleIncomingAutoEnd]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        const isCall = data?.notificationKind === "incoming_call" || data?.kind === "call";
        return {
          shouldShowAlert: true,
          shouldPlaySound: !isCall,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldSetBadge: true,
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
      });
    })();
  }, [isAuthenticated, offerIncomingCall]);

  useEffect(() => {
    if (Platform.OS === "web" || !isAuthenticated) return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (!data) return;
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
      void offerIncomingCall(info);
    });
    return () => sub.remove();
  }, [isAuthenticated, scheduleIncomingAutoEnd]);

  const respondToIncomingCall = async (action: "accept" | "decline", declineMessage?: string) => {
    if (!incomingCall || !user?.dbId) return;
    const call = incomingCall;
    clearIncomingAutoEnd();
    offeredCallIdRef.current = null;
    setIncomingCall(null);
    setCallWaiting(null);
    try {
      await stopIncomingCallExperience(call.callId);
      await webrtcFetch(`/calls/${call.callId}/respond`, user.sessionToken, {
        method: "POST",
        body: JSON.stringify({
          userId: user.dbId,
          action,
          ...(action === "decline" && declineMessage ? { declineMessage } : {}),
        }),
      }).catch(() => {});
      if (action === "accept") {
        presentIncomingCall(call);
        await acceptIncoming();
      } else {
        void loadMessages(String(call.chatId));
      }
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
            await webrtcFetch(`/calls/${callId}/respond`, user.sessionToken, {
              method: "POST",
              body: JSON.stringify({ userId: user.dbId, action: "accept" }),
            }).catch(() => {});
            presentIncomingCall(waiting);
            await acceptIncoming();
            return;
          }
          if (incomingCall?.callId === callId) {
            respondToIncomingCallRef.current("accept");
            return;
          }
          await offerIncomingCall({
            callId,
            channel: "",
            chatId: 0,
            callerName: "Videh user",
          });
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
        <Stack.Screen name="settings/last-seen-online" options={{ headerShown: false }} />
        <Stack.Screen name="broadcasts/index" options={{ headerShown: false }} />
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
            await webrtcFetch(`/calls/${waiting.callId}/respond`, user.sessionToken, {
              method: "POST",
              body: JSON.stringify({ userId: user.dbId, action: "accept" }),
            }).catch(() => {});
            presentIncomingCall(waiting);
            await acceptIncoming();
          }}
          onEndAndAnswer={async () => {
            const waiting = callWaiting;
            setCallWaiting(null);
            clearIncomingAutoEnd();
            offeredCallIdRef.current = null;
            await stopIncomingCallExperience(waiting?.callId);
            await endCall();
            if (waiting) {
              await offerIncomingCall({
                callId: waiting.callId,
                channel: waiting.channel,
                chatId: waiting.chatId,
                type: waiting.type,
                callerName: waiting.callerName,
                participantCount: waiting.participantCount,
              });
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

