import { Alert } from "react-native";

/** Flip to true when Hey Videh is ready for production. */
export const HEY_VIDeh_ENABLED = true;

export const HEY_VIDeh_COMING_SOON_TITLE = "Coming Soon";

export const HEY_VIDeh_COMING_SOON_DESCRIPTION =
  "Videh is your AI voice assistant. Say \"Hey Friend\" to wake it — call or message contacts, check unread chats, schedule messages, and ask anything about the app.\n\nEnable it in Settings → Hey Videh.";

export function showHeyVidehComingSoon(): void {
  Alert.alert(HEY_VIDeh_COMING_SOON_TITLE, HEY_VIDeh_COMING_SOON_DESCRIPTION);
}
