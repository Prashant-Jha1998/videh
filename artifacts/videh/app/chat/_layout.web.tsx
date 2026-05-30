import { Stack, usePathname } from "expo-router";
import React from "react";
import { useWindowDimensions, View } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScreenErrorFallback } from "@/components/ScreenErrorFallback";
import { WebChatsSidebar } from "@/components/web/WebChatsSidebar";

const DESKTOP_MIN = 900;
const SIDEBAR_WIDTH = 400;

export default function ChatWebLayout() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const split = width >= DESKTOP_MIN;
  const activeChatId = pathname?.match(/\/chat\/([^/]+)/)?.[1];

  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen name="send-location" options={{ presentation: "card" }} />
      <Stack.Screen name="message-info" />
      <Stack.Screen name="media-compose" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="media-compose-batch" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="video-viewer" options={{ presentation: "fullScreenModal" }} />
    </Stack>
  );

  if (!split) {
    return (
      <ErrorBoundary
        FallbackComponent={(props) => (
          <ScreenErrorFallback
            {...props}
            title="Chat couldn't open"
            message="There was a problem showing this chat. Go back and open it again."
          />
        )}
      >
        {stack}
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={(props) => (
        <ScreenErrorFallback
          {...props}
          title="Chat couldn't open"
          message="There was a problem showing this chat. Go back and open it again."
        />
      )}
    >
      <View style={{ flex: 1, flexDirection: "row", height: "100%" }}>
        <WebChatsSidebar width={SIDEBAR_WIDTH} activeChatId={activeChatId} />
        <View style={{ flex: 1, minWidth: 0 }}>{stack}</View>
      </View>
    </ErrorBoundary>
  );
}
