import { Stack, useLocalSearchParams, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScreenErrorFallback } from "@/components/ScreenErrorFallback";
import { WebDesktopShell } from "@/components/web/WebDesktopShell";
import { WebContactInfoPanel } from "@/components/web/WebContactInfoPanel";
import { activeChatIdFromPath, WEB_DESKTOP_MIN_WIDTH } from "@/lib/web/webDesktop";
import { useApp } from "@/context/AppContext";

export default function ChatWebLayout() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const split = width >= WEB_DESKTOP_MIN_WIDTH;
  const activeChatId = activeChatIdFromPath(pathname);
  const { chats } = useApp();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const chatId = activeChatId ?? params.id;
  const chat = chatId ? chats.find((c) => c.id === chatId) : undefined;
  const [contactPanelOpen, setContactPanelOpen] = useState(true);
  useEffect(() => {
    setContactPanelOpen(true);
  }, [chatId]);
  const showContactPanel = split && chatId && chat && !chat.isGroup && contactPanelOpen;

  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen name="send-location" options={{ presentation: "card" }} />
      <Stack.Screen name="message-info" />
      <Stack.Screen name="media-compose" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="media-compose-batch" options={{ presentation: "fullScreenModal" }} />
      <Stack.Screen name="document-compose" options={{ presentation: "fullScreenModal" }} />
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

  const chatName = params.name ?? chat?.name ?? "Chat";

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
      <WebDesktopShell forceMainContent>
        <View style={{ flex: 1, flexDirection: "row", minWidth: 0 }}>
          <View style={{ flex: 1, minWidth: 0 }}>{stack}</View>
          {showContactPanel ? (
            <WebContactInfoPanel
              chatId={chatId}
              chatName={chatName}
              onClose={() => setContactPanelOpen(false)}
            />
          ) : null}
        </View>
      </WebDesktopShell>
    </ErrorBoundary>
  );
}
