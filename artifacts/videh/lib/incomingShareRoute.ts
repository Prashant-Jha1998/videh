import type { Href, Router } from "expo-router";
import { hasPendingIncomingShare } from "@/lib/incomingSharePayload";

/** Where to send the user when Videh was opened via Android/iOS share sheet. */
export function incomingShareRoute(isAuthenticated: boolean): Href {
  return (isAuthenticated ? "/share-to-chat" : "/auth/phone") as Href;
}

/** After login, open share picker if user launched Videh from another app's share sheet. */
export async function replaceAfterAuth(router: Router, fallback: Href): Promise<void> {
  if (await hasPendingIncomingShare()) {
    router.replace(incomingShareRoute(true));
    return;
  }
  router.replace(fallback);
}
