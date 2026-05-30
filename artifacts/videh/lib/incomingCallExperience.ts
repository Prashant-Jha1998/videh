import * as Linking from "expo-linking";
import { AppState, Platform } from "react-native";
import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { dismissIncomingCallNotification } from "@/lib/incomingCallNotification";
import { stopCallAlert, startIncomingCallAlert } from "@/lib/callRingtone";
import { dismissNativeIncomingCall } from "@/lib/videhNativeCallUi";
import { endCallKeep, showCallKeepIncoming } from "@/lib/callKeep";

let ringingCallId: string | null = null;

export function getRingingCallId(): string | null {
  return ringingCallId;
}

/** Returns false if this call is already being offered (avoids duplicate ring/UI from poll). */
export function claimIncomingCallRing(callId: string): boolean {
  if (ringingCallId === callId) return false;
  ringingCallId = callId;
  return true;
}

/** One ringtone only — user's premium call sound from settings. */
export async function startIncomingCallExperience(call: IncomingCallInfo & { callerName: string }): Promise<void> {
  if (Platform.OS === "web") return;
  if (ringingCallId !== call.callId) {
    ringingCallId = call.callId;
  }
  await startIncomingCallAlert();
}

export async function stopIncomingCallExperience(callId?: string): Promise<void> {
  if (callId && ringingCallId && ringingCallId !== callId) {
    return;
  }
  ringingCallId = null;
  dismissNativeIncomingCall();
  await stopCallAlert();
  if (callId) {
    await dismissIncomingCallNotification(callId);
    endCallKeep(callId, "declined");
  }
}

export function presentIncomingCallUi(call: IncomingCallInfo & { callerName: string }): {
  setIncoming: boolean;
  broughtToForeground: boolean;
} {
  showCallKeepIncoming(call.callId, call.callerName, call.chatId, call.type === "video");

  const state = AppState.currentState;
  const inBackground = state === "background" || state === "inactive";

  if (inBackground && Platform.OS !== "web") {
    const deepLink =
      `videh://call/${call.chatId}?callId=${encodeURIComponent(call.callId)}` +
      `&incoming=1&ringing=1&type=${call.type}&name=${encodeURIComponent(call.callerName)}` +
      `&channel=${encodeURIComponent(call.channel)}`;
    void Linking.openURL(deepLink).catch(() => {});
    return { setIncoming: true, broughtToForeground: true };
  }

  return { setIncoming: true, broughtToForeground: false };
}
