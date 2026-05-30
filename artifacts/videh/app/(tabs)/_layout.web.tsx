import { usePathname, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { WebChatsSidebar } from "@/components/web/WebChatsSidebar";
import { ClassicTabLayout } from "./TabLayoutImpl";

const DESKTOP_MIN = 900;
const SIDEBAR_WIDTH = 400;

function WebDesktopEmptyPane() {
  const colors = useColors();
  return (
    <View style={[styles.emptyPane, { backgroundColor: colors.background, borderLeftColor: colors.border }]}>
      <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>Videh Web</Text>
      <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
        Select a chat to start messaging
      </Text>
    </View>
  );
}

/** WhatsApp Web–style: chat list stays visible on wide screens. */
export default function WebTabsLayout() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const split = width >= DESKTOP_MIN;
  const onChatsTab =
    !pathname ||
    pathname.includes("/chats") ||
    pathname.endsWith("/(tabs)") ||
    pathname === "/";

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpenChat = (ev: Event) => {
      const chatId = (ev as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (chatId) router.push({ pathname: "/chat/[id]", params: { id: chatId } });
    };
    window.addEventListener("videh-open-chat", onOpenChat);
    return () => window.removeEventListener("videh-open-chat", onOpenChat);
  }, [router]);

  if (!split || !onChatsTab) {
    return <ClassicTabLayout />;
  }

  return (
    <View style={styles.splitRoot}>
      <WebChatsSidebar width={SIDEBAR_WIDTH} />
      <WebDesktopEmptyPane />
      <View style={styles.hiddenTabs} pointerEvents="none">
        <ClassicTabLayout />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  splitRoot: { flex: 1, flexDirection: "row", height: "100%" },
  emptyPane: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyTitle: { fontSize: 28, fontFamily: "Inter_300Light", marginBottom: 8 },
  emptySub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 420 },
  hiddenTabs: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
});
