import * as Font from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useApp } from "@/context/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { isAuthenticated } = useApp();
  const router = useRouter();

  // Watch auth state — redirect to login on logout
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/auth/phone");
    }
  }, [isAuthenticated]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="auth/phone" options={{ headerShown: false }} />
      <Stack.Screen name="auth/otp" options={{ headerShown: false }} />
      <Stack.Screen name="auth/profile" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="call/[id]" options={{ headerShown: false, presentation: "fullScreenModal" }} />
      <Stack.Screen name="contacts" options={{ headerShown: false }} />
      <Stack.Screen name="status/view" options={{ headerShown: false, presentation: "fullScreenModal" }} />
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
      .catch(() => {
        // Fonts failed to load — proceed with system fonts
      })
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
