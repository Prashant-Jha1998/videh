import * as Font from "expo-font";
import * as Notifications from "expo-notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, Vibration, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "@/context/AppContext";
import { UiPreferencesProvider } from "@/context/UiPreferencesContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getApiUrl } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

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
  const { isAuthenticated, isInitialized, user } = useApp();
  const colors = useColors();
  const router = useRouter();
  const notifResponseRef = useRef<Notifications.NotificationResponse | null>(null);
  const [incomingCall, setIncomingCall] = useState<{
    callId: string;
    channel: string;
    chatId: number;
    type: "audio" | "video";
    callerName: string;
    participantCount: number;
  } | null>(null);

  // Navigate to chat when notification is tapped
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
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
  }, [isAuthenticated, user?.dbId]);

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
        const res = await fetch(`${getApiUrl()}/api/webrtc/calls/incoming/${user.dbId}`);
        const data = await res.json() as { success?: boolean; calls?: any[] };
        if (cancelled) return;
        const next = data.calls?.[0] ?? null;
        setIncomingCall((prev) => {
          if (!next) return null;
          if (prev?.callId === next.callId) return prev;
          if (Platform.OS !== "web") {
            Vibration.vibrate([0, 700, 450], true);
            Notifications.scheduleNotificationAsync({
              content: {
                title: `${next.type === "video" ? "Video" : "Voice"} call`,
                body: `${next.callerName ?? "Videh user"} is calling`,
                sound: "default",
                data: { callId: next.callId, chatId: next.chatId, type: next.type },
              },
              trigger: null,
            }).catch(() => {});
          }
          return next;
        });
      } catch {}
    };
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (Platform.OS !== "web") Vibration.cancel();
    };
  }, [isAuthenticated, user?.dbId]);

  const respondToIncomingCall = async (action: "accept" | "decline") => {
    if (!incomingCall || !user?.dbId) return;
    const call = incomingCall;
    setIncomingCall(null);
    if (Platform.OS !== "web") Vibration.cancel();
    await fetch(`${getApiUrl()}/api/webrtc/calls/${call.callId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.dbId, action }),
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
        <Stack.Screen name="broadcasts/index" options={{ headerShown: false }} />
      </Stack>
      {incomingCall && (
        <View style={styles.incomingOverlay}>
          <View style={styles.incomingCard}>
            <Text style={styles.incomingLabel}>{incomingCall.type === "video" ? "Incoming video call" : "Incoming voice call"}</Text>
            <Text style={styles.incomingName}>{incomingCall.callerName}</Text>
            <Text style={styles.incomingSub}>
              {incomingCall.participantCount > 2 ? `${incomingCall.participantCount} participants conference call` : "Videh call"}
            </Text>
            <View style={styles.incomingActions}>
              <TouchableOpacity style={[styles.callAction, styles.declineAction]} onPress={() => void respondToIncomingCall("decline")}>
                <Text style={styles.callActionText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.callAction, styles.acceptAction]} onPress={() => void respondToIncomingCall("accept")}>
                <Text style={styles.callActionText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
                  <RootLayoutNav />
                </AppProvider>
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ErrorBoundary>
      </UiPreferencesProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  incomingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  incomingCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#111B21",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  incomingLabel: { color: "#00A884", fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  incomingName: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold", textAlign: "center" },
  incomingSub: { color: "rgba(255,255,255,0.65)", fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center" },
  incomingActions: { flexDirection: "row", gap: 18, marginTop: 28 },
  callAction: { minWidth: 112, borderRadius: 28, paddingVertical: 14, alignItems: "center" },
  declineAction: { backgroundColor: "#ef4444" },
  acceptAction: { backgroundColor: "#00A884" },
  callActionText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
