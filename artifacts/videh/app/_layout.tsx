import * as Font from "expo-font";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "@/context/AppContext";
import { AssistantProvider } from "@/context/AssistantContext";
import { CallSessionProvider, shouldRouteIncomingToCallScreen, useCallSession } from "@/context/CallSessionContext";
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
import { dismissChatMessageNotifications } from "@/lib/chatMessageNotification";
import { INCOMING_RING_TIMEOUT_MS } from "@/lib/callConstants";
import { wakeScreenForIncomingCall } from "@/lib/inCallAudio";
import { startIncomingCallAlert, stopCallAlert } from "@/lib/callRingtone";
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
  if (Platform.OS === "web") return false;
  const state = AppState.currentState;
  return state === "active" || state === "background";
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

// Show notification when app is foregrounded
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

function RootLayoutNav() {
  const { isAuthenticated, isInitialized, user, chats, markAsRead, muteChat, sendMessage, loadMessages } = useApp();
  const colors = useColors();
  const router = useRouter();
  const {
    session: activeCallSession,
    duration: callDuration,
    presentIncomingCall,
    returnToCallScreen,
    endCall,
  } = useCallSession();
  const pendingIncomingRef = useRef<IncomingCallInfo | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const incomingRingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);

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
      void stopCallAlert();
      void dismissIncomingCallNotification(callId);
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
    if (activeCallSession?.engineActive && !activeCallSession.ringing) return;

    const silenceUnknown = await loadCachedSilenceUnknownCallers();
    if (silenceUnknown && user?.dbId && !isKnownCaller(Number(next.chatId), chats)) {
      await declineIncomingCallSilently(next.callId, user.dbId, user.sessionToken);
      void stopCallAlert();
      return;
    }

    wakeScreenForIncomingCall();

    if (Platform.OS !== "web") {
      void startIncomingCallAlert();
      const callPayload = { ...next, callerName: next.callerName };
      const appState = AppState.currentState;
      if (appState === "background" || appState === "inactive" || !appState) {
        pendingIncomingRef.current = callPayload;
        void showIncomingCallNotification(callPayload);
      }
    }

    scheduleIncomingAutoEnd(next.callId);

    if (canPresentIncomingCallUi() && shouldRouteIncomingToCallScreen()) {
      presentIncomingCall(next);
      setIncomingCall(null);
    } else {
      setIncomingCall((prev) => (prev?.callId === next.callId ? prev : next));
    }
  }, [
    activeCallSession?.engineActive,
    activeCallSession?.ringing,
    chats,
    presentIncomingCall,
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
        void stopCallAlert();
        const action = actionId === NOTIFICATION_ACTION_ACCEPT_CALL ? "accept" : "decline";
        void fetch(`${getApiUrl()}/api/webrtc/calls/${data.callId}/respond`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(user.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
          },
          body: JSON.stringify({ userId: user.dbId, action }),
        }).then(() => {
          if (action === "accept") {
            router.push({
              pathname: "/call/[id]",
              params: {
                id: String(data.chatId),
                name: String(data.callerName ?? "Videh user"),
                type: data.type === "video" ? "video" : "audio",
                channel: String(data.channel ?? ""),
                callId: String(data.callId),
                incoming: "1",
              },
            });
          }
        }).catch(() => {});
        return;
      }
      if (data?.callId && isAuthenticated) {
        void fetch(`${getApiUrl()}/api/webrtc/calls/${data.callId}/status?userId=${user?.dbId ?? ""}`)
          .then((res) => res.json())
          .then((payload: { success?: boolean; call?: IncomingCallInfo }) => {
            const call = payload.call;
            if (!call) return;
            if (shouldRouteIncomingToCallScreen()) {
              presentIncomingCall(call);
            } else {
              setIncomingCall(call);
            }
          })
          .catch(() => {});
        return;
      }
      if (data?.chatId && isAuthenticated) {
        router.push({ pathname: "/chat/[id]", params: { id: data.chatId } });
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, markAsRead, muteChat, router, sendMessage, user?.dbId, user?.sessionToken, presentIncomingCall]);

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
          setIncomingCall((prev) => {
            if (prev) {
              void stopCallAlert();
              void dismissIncomingCallNotification(prev.callId);
            }
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
      if (action === "accepted") {
        void stopCallAlert();
      }
      if (action === "declined" || action === "ended" || action === "missed" || action === "busy") {
        clearIncomingAutoEnd();
        if (callId) void dismissIncomingCallNotification(callId);
        setIncomingCall((prev) => {
          if (!prev) return prev;
          if (callId && prev.callId !== callId) return prev;
          void stopCallAlert();
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
      void stopCallAlert();
    };
  }, [isAuthenticated, user?.dbId, user?.sessionToken, chats, loadMessages, activeCallSession?.callId, offerIncomingCall, clearIncomingAutoEnd]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && state !== "background") return;
      const pending = pendingIncomingRef.current;
      if (pending && shouldRouteIncomingToCallScreen() && canPresentIncomingCallUi()) {
        pendingIncomingRef.current = null;
        wakeScreenForIncomingCall();
        presentIncomingCall(pending);
        setIncomingCall(null);
      }
    });
    return () => sub.remove();
  }, [presentIncomingCall]);

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
      wakeScreenForIncomingCall();
      setTimeout(() => {
        if (!canPresentIncomingCallUi() || !shouldRouteIncomingToCallScreen()) return;
        if (activeCallIdRef.current === info.callId) return;
        presentIncomingCall(info);
        setIncomingCall(null);
        scheduleIncomingAutoEnd(info.callId);
      }, 400);
    });
    return () => sub.remove();
  }, [isAuthenticated, presentIncomingCall, scheduleIncomingAutoEnd]);

  const respondToIncomingCall = async (action: "accept" | "decline", declineMessage?: string) => {
    if (!incomingCall || !user?.dbId) return;
    const call = incomingCall;
    clearIncomingAutoEnd();
    setIncomingCall(null);
    try {
      await stopCallAlert();
      await webrtcFetch(`/calls/${call.callId}/respond`, user.sessionToken, {
        method: "POST",
        body: JSON.stringify({
          userId: user.dbId,
          action,
          ...(action === "decline" && declineMessage ? { declineMessage } : {}),
        }),
      }).catch(() => {});
      if (action === "accept") {
        router.push({
          pathname: "/call/[id]",
          params: {
            id: String(call.chatId),
            name: call.callerName,
            type: call.type,
            channel: call.channel,
            callId: call.callId,
            incoming: "1",
          },
        });
      } else {
        void loadMessages(String(call.chatId));
      }
    } catch {
      /* keep UI responsive if ringtone/network fails */
    }
  };

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
        <Stack.Screen name="settings/chats" options={{ headerShown: false }} />
        <Stack.Screen name="settings/theme" options={{ headerShown: false }} />
        <Stack.Screen name="settings/help" options={{ headerShown: false }} />
        <Stack.Screen name="settings/last-seen-online" options={{ headerShown: false }} />
        <Stack.Screen name="broadcasts/index" options={{ headerShown: false }} />
      </Stack>
      {incomingCall && Platform.OS === "web" ? (
        <IncomingCallOverlay
          call={incomingCall}
          onAccept={() => { void respondToIncomingCall("accept"); }}
          onDecline={() => { void respondToIncomingCall("decline"); }}
          onDeclineWithMessage={(text) => { void respondToIncomingCall("decline", text); }}
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

