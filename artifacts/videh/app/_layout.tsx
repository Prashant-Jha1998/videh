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
import { AppProvider, useApp } from "@/context/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Show notification when app is foregrounded
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

function RootLayoutNav() {
  const { isAuthenticated, isInitialized } = useApp();
  const router = useRouter();
  const notifResponseRef = useRef<Notifications.NotificationResponse | null>(null);

  // Navigate to chat when notification is tapped
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.chatId && isAuthenticated) {
        router.push({ pathname: "/chat/[id]", params: { id: data.chatId } });
      }
    });
    return () => sub.remove();
  }, [isAuthenticated]);

  // Wait for AsyncStorage to load before deciding where to route
  useEffect(() => {
    if (!isInitialized) return;
    if (!isAuthenticated) {
      router.replace("/auth/phone");
    }
  }, [isAuthenticated, isInitialized]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="auth/phone" options={{ headerShown: false }} />
      <Stack.Screen name="auth/otp" options={{ headerShown: false }} />
      <Stack.Screen name="auth/profile" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="chat/message-info" options={{ headerShown: false }} />
      <Stack.Screen name="chat-info/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="call/[id]" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="contacts" options={{ headerShown: false }} />
      <Stack.Screen name="status/view" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="status/viewers" options={{ headerShown: false }} />
      <Stack.Screen name="new-group" options={{ headerShown: false }} />
      <Stack.Screen name="starred" options={{ headerShown: false }} />
    </Stack>
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
    </SafeAreaProvider>
  );
}
