import { Stack } from "expo-router";
import React from "react";
import { WebDesktopShell } from "@/components/web/WebDesktopShell";

/** Settings detail screens sit in the right pane on desktop (WhatsApp Web style). */
export default function SettingsWebLayout() {
  return (
    <WebDesktopShell forceMainContent>
      <Stack screenOptions={{ headerShown: false }} />
    </WebDesktopShell>
  );
}
