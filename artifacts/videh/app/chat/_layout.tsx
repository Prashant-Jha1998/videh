import { Stack } from "expo-router";
import React from "react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScreenErrorFallback } from "@/components/ScreenErrorFallback";

export default function ChatLayout() {
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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="[id]" />
        <Stack.Screen name="send-location" options={{ presentation: "card" }} />
        <Stack.Screen name="message-info" />
        <Stack.Screen name="forward" options={{ presentation: "card" }} />
        <Stack.Screen name="media-compose" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="media-compose-batch" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="document-compose" options={{ presentation: "fullScreenModal" }} />
        <Stack.Screen name="video-viewer" options={{ presentation: "fullScreenModal" }} />
      </Stack>
    </ErrorBoundary>
  );
}
