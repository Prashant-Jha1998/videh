import { Alert } from "react-native";

/** Flip to true when Hey Videh is ready for production. */
export const HEY_VIDeh_ENABLED = false;

export const HEY_VIDeh_COMING_SOON_TITLE = "Coming Soon";

export const HEY_VIDeh_COMING_SOON_DESCRIPTION =
  "Hey Videh is Videh's hands-free voice assistant. Say \"Hey Videh\" to call or message contacts, check unread chats and missed calls, see group activity, and ask questions about the app — in your language.\n\nWe're putting the finishing touches on this feature. It will be available in a future update.";

export function showHeyVidehComingSoon(): void {
  Alert.alert(HEY_VIDeh_COMING_SOON_TITLE, HEY_VIDeh_COMING_SOON_DESCRIPTION);
}
