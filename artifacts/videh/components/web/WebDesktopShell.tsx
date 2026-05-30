import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useApp } from "@/context/AppContext";
import {
  webCallNumber,
  webCreateCallLink,
  webScheduleCall,
  webStartCall,
} from "@/lib/web/webCallActions";
import { WebNavRail } from "@/components/web/WebNavRail";
import { WebChatsSidebar } from "@/components/web/WebChatsSidebar";
import { WebCallsListPane } from "@/components/web/WebCallsListPane";
import { WebStatusListPane } from "@/components/web/WebStatusListPane";
import { WebSettingsNavPane } from "@/components/web/WebSettingsNavPane";
import { WebEmptyPane } from "@/components/web/WebEmptyPane";
import {
  activeChatIdFromPath,
  getWebSection,
  WEB_LIST_PANE_WIDTH,
} from "@/lib/web/webDesktop";

type Props = {
  children: React.ReactNode;
  /** When true, main area is always children (e.g. open chat). */
  forceMainContent?: boolean;
};

export function WebDesktopShell({ children, forceMainContent }: Props) {
  const router = useRouter();
  const { user } = useApp();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ archived?: string }>();
  const section = getWebSection(pathname);
  const activeChatId = activeChatIdFromPath(pathname);
  const archivedMode = section === "archived" || params.archived === "1";
  const settingsDetail = section === "settings" && /\/settings\//.test(pathname ?? "");

  const listPane = (() => {
    switch (section) {
      case "calls":
        return <WebCallsListPane width={WEB_LIST_PANE_WIDTH} />;
      case "status":
        return <WebStatusListPane width={WEB_LIST_PANE_WIDTH} />;
      case "settings":
        return <WebSettingsNavPane width={WEB_LIST_PANE_WIDTH} />;
      case "starred":
      case "chats":
      case "archived":
      default:
        return (
          <WebChatsSidebar
            width={WEB_LIST_PANE_WIDTH}
            activeChatId={activeChatId}
            archivedOnly={archivedMode}
          />
        );
    }
  })();

  const emptyPane = (() => {
    if (forceMainContent || activeChatId) return null;
    switch (section) {
      case "calls":
        return (
          <WebEmptyPane
            icon="call-outline"
            title="Calls on Videh Web"
            subtitle="Start a voice or video call from a chat, or pick a contact."
            footer="Your personal calls are end-to-end encrypted."
            actions={[
              { icon: "videocam-outline", label: "Start call", onPress: () => void webStartCall(router) },
              {
                icon: "link-outline",
                label: "New call link",
                onPress: () => void webCreateCallLink(user?.sessionToken),
              },
              { icon: "keypad-outline", label: "Call a number", onPress: () => webCallNumber(router) },
              { icon: "calendar-outline", label: "Schedule call", onPress: () => webScheduleCall(router) },
            ]}
          />
        );
      case "status":
        return (
          <WebEmptyPane
            icon="ellipse-outline"
            title="Share status updates"
            subtitle="Share photos, videos and text that disappear after 24 hours."
          />
        );
      case "settings":
        return (
          <WebEmptyPane
            icon="settings-outline"
            title="Videh Settings"
            subtitle="Choose a category on the left to manage your account, privacy, and chats."
          />
        );
      case "starred":
        return null;
      default:
        return (
          <WebEmptyPane
            icon="chatbubbles-outline"
            title="Videh Web"
            subtitle="Send and receive messages without keeping your phone online. Use Videh on up to 4 linked devices."
            footer="End-to-end encrypted"
          />
        );
    }
  })();

  const showMainOnly =
    forceMainContent || activeChatId || section === "starred" || settingsDetail;

  return (
    <View style={styles.root}>
      <WebNavRail active={section} />
      {listPane}
      <View style={styles.main}>
        {showMainOnly ? children : emptyPane ?? children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", height: "100%" },
  main: { flex: 1, minWidth: 0 },
});
