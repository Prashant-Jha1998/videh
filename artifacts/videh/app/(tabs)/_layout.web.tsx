import { Slot, usePathname, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { WebDesktopShell } from "@/components/web/WebDesktopShell";
import { ClassicTabLayout } from "./_TabLayoutImpl";
import { WEB_DESKTOP_MIN_WIDTH } from "@/lib/web/webDesktop";

/** WhatsApp Web–style desktop: nav rail + list pane + main content. */
export default function WebTabsLayout() {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const router = useRouter();
  const split = width >= WEB_DESKTOP_MIN_WIDTH;

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpenChat = (ev: Event) => {
      const chatId = (ev as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (chatId) router.push({ pathname: "/chat/[id]", params: { id: chatId } });
    };
    window.addEventListener("videh-open-chat", onOpenChat);
    return () => window.removeEventListener("videh-open-chat", onOpenChat);
  }, [router]);

  if (!split) {
    return <ClassicTabLayout />;
  }

  const hideTabContent =
    !pathname?.includes("/starred") &&
    (pathname?.includes("/chats") ||
      pathname?.includes("/calls") ||
      pathname?.includes("/status") ||
      (pathname?.includes("/settings") && !pathname?.includes("/settings/")));

  return (
    <WebDesktopShell>
      <View style={[styles.mainSlot, hideTabContent && styles.hiddenSlot]}>
        <Slot />
      </View>
      <View style={styles.hiddenTabs} pointerEvents="none">
        <ClassicTabLayout />
      </View>
    </WebDesktopShell>
  );
}

const styles = StyleSheet.create({
  mainSlot: { flex: 1, minWidth: 0, height: "100%" },
  hiddenSlot: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
  hiddenTabs: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
});
