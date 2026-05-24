import * as Font from "expo-font";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "@/context/AppContext";
import { AssistantProvider } from "@/context/AssistantContext";
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
import { startIncomingCallAlert, stopCallAlert } from "@/lib/callRingtone";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

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
  const { isAuthenticated, isInitialized, user, markAsRead, muteChat, sendMessage, loadMessages } = useApp();
  const colors = useColors();
  const router = useRouter();
  const notifResponseRef = useRef<Notifications.NotificationResponse | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);

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
        return;
      }
      if (actionId === NOTIFICATION_ACTION_MUTE && chatId && isAuthenticated) {
        muteChat(chatId);
        return;
      }
      if (actionId === NOTIFICATION_ACTION_REPLY && chatId && isAuthenticated) {
        const replyText = String((response as any).userText ?? "").trim();
        if (replyText) sendMessage(chatId, replyText);
        return;
      }
      if (
        (actionId === NOTIFICATION_ACTION_ACCEPT_CALL || actionId === NOTIFICATION_ACTION_DECLINE_CALL)
        && data?.callId
        && user?.dbId
      ) {
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
          .then((payload: { success?: boolean; call?: any }) => {
            const call = payload.call;
            if (!call) return;
            setIncomingCall(call);
          })
          .catch(() => {});
        return;
      }
      if (data?.chatId && isAuthenticated) {
        router.push({ pathname: "/chat/[id]", params: { id: data.chatId } });
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, markAsRead, muteChat, router, sendMessage, user?.dbId, user?.sessionToken]);

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
        setIncomingCall((prev) => {
          if (!next) {
            if (prev) void stopCallAlert();
            return null;
          }
          if (prev?.callId === next.callId) return prev;
          if (Platform.OS !== "web") {
            void startIncomingCallAlert();
            Notifications.scheduleNotificationAsync({
              content: {
                title: `${next.type === "video" ? "Video" : "Voice"} call`,
                body: `${next.callerName ?? "Videh user"} is calling`,
                sound: undefined,
                priority: Notifications.AndroidNotificationPriority.MAX,
                data: { callId: next.callId, chatId: next.chatId, type: next.type, channel: next.channel, callerName: next.callerName },
                categoryIdentifier: "incoming_call",
              },
              trigger: null,
              ...(Platform.OS === "android" ? { channelId: VIDEH_CALLS_CHANNEL_ID } : {}),
            }).catch(() => {});
          }
          return next;
        });
      } catch {}
    };
    void poll();
    const timer = setInterval(poll, 800);
    const unsubCall = onCallSignal((payload) => {
      const action = String(payload.action ?? "");
      const callId = payload.callId ? String(payload.callId) : "";
      if (action === "ringing" && callId && user.dbId) {
        setIncomingCall((prev) => {
          if (prev?.callId === callId) return prev;
          if (Platform.OS !== "web") void startIncomingCallAlert();
          return {
            callId,
            channel: String(payload.channel ?? ""),
            chatId: Number(payload.chatId),
            type: payload.type === "video" ? "video" : "audio",
            callerName: String(payload.callerName ?? "Videh user"),
            participantCount: Number(payload.participantCount ?? 2),
          };
        });
      }
      if (action === "accepted") {
        void stopCallAlert();
      }
      if (action === "declined" || action === "ended" || action === "missed" || action === "busy") {
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
      void stopCallAlert();
    };
  }, [isAuthenticated, user?.dbId, user?.sessionToken, loadMessages]);

  const respondToIncomingCall = async (action: "accept" | "decline", declineMessage?: string) => {
    if (!incomingCall || !user?.dbId) return;
    const call = incomingCall;
    setIncomingCall(null);
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
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="chat/send-location" options={{ headerShown: false, presentation: "card" }} />
        <Stack.Screen name="chat/message-info" options={{ headerShown: false }} />
        <Stack.Screen name="chat/media-compose" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="chat/media-compose-batch" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="chat/video-viewer" options={{ headerShown: false, presentation: "fullScreenModal" }} />
        <Stack.Screen name="chat-info/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="call/[id]" options={{ headerShown: false, presentation: "fullScreenModal" }} />
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
        <Stack.Screen name="broadcasts/index" options={{ headerShown: false }} />
      </Stack>
      {incomingCall ? (
        <IncomingCallOverlay
          call={incomingCall}
          onAccept={() => void respondToIncomingCall("accept")}
          onDecline={() => void respondToIncomingCall("decline")}
          onDeclineWithMessage={(text) => void respondToIncomingCall("decline", text)}
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
                  <AssistantProvider>
                    <RootLayoutNav />
                  </AssistantProvider>
                </AppProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </UiPreferencesProvider>
    </SafeAreaProvider>
  );
}

