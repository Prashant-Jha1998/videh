import { Alert, Platform, Share } from "react-native";
import type { Router } from "expo-router";
import { createCallLink } from "@/lib/callLinks";
function shareableCallUrl(link: { deepLink: string; webPath?: string }): string {
  if (typeof window !== "undefined" && link.webPath) {
    return `${window.location.origin}${link.webPath}`;
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain && link.webPath) {
    const base = domain.startsWith("http") ? domain : `https://${domain}`;
    return `${base.replace(/\/$/, "")}${link.webPath}`;
  }
  return link.deepLink;
}

export async function webStartCall(router: Router): Promise<void> {
  router.push("/contacts");
}

export async function webCreateCallLink(sessionToken?: string | null): Promise<void> {
  const link = await createCallLink(sessionToken, { type: "video", hoursValid: 48 });
  if (!link) {
    Alert.alert("Could not create link", "Please try again in a moment.");
    return;
  }
  const url = shareableCallUrl(link);
  const message = `Join my Videh call:\n${url}`;
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
      Alert.alert("Call link created", "Link copied to clipboard. Share it with anyone you want to join.");
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    await Share.share({ message, title: "Videh call link" });
  } catch {
    Alert.alert("Call link created", url);
  }
}

export function webCallNumber(router: Router): void {
  router.push("/contacts");
}

export function webScheduleCall(router: Router): void {
  Alert.alert(
    "Schedule call",
    "Open a chat, tap the menu (⋮), and choose Schedule message to set a reminder before your call.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Open chats", onPress: () => router.push("/(tabs)/chats") },
    ],
  );
}
