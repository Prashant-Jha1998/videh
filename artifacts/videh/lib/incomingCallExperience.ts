import * as Linking from "expo-linking";
import { AppState, Platform } from "react-native";
import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { dismissIncomingCallNotification } from "@/lib/incomingCallNotification";
import { stopCallAlert, startIncomingCallAlert } from "@/lib/callRingtone";
import { dismissNativeIncomingCall, displayNativeIncomingCall } from "@/lib/videhNativeCallUi";
import { endCallKeep, showCallKeepIncoming } from "@/lib/callKeep";

let ringingCallId: string | null = null;

export function isAppInForeground(): boolean {
  return AppState.currentState === "active";
}

export function getRingingCallId(): string | null {
  return ringingCallId;
}

/** Returns false if this call is already being offered (avoids duplicate ring/UI from poll). */
export function claimIncomingCallRing(callId: string): boolean {
  if (ringingCallId === callId) return false;
  ringingCallId = callId;
  return true;
}

/** Foreground: expo-av premium tone. Background: native InCallManager + notification channel sound. */
export async function startIncomingCallExperience(call: IncomingCallInfo & { callerName: string }): Promise<void> {
  if (Platform.OS === "web") return;
  if (ringingCallId !== call.callId) {
    ringingCallId = call.callId;
  }
  if (isAppInForeground()) {
    await startIncomingCallAlert();
    return;
  }
  displayNativeIncomingCall({
    callId: call.callId,
    callerName: call.callerName,
    isVideo: call.type === "video",
  });
}

export async function stopIncomingCallExperience(callId?: string, opts?: { force?: boolean }): Promise<void> {
  if (!opts?.force && callId && ringingCallId && ringingCallId !== callId) {
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

/**
 * WhatsApp-style surfaces:
 * - Foreground: in-app overlay only (CallKeep hidden).
 * - Background/killed path: CallKeep system UI + optional deep link when no CallKeep.
 */
export function presentIncomingCallUi(
  call: IncomingCallInfo & { callerName: string },
  opts?: { useNativeSurface?: boolean },
): {
  setIncoming: boolean;
  broughtToForeground: boolean;
} {
  const inBackground = !isAppInForeground();
  const useNative = opts?.useNativeSurface ?? inBackground;

  if (useNative) {
    showCallKeepIncoming(call.callId, call.callerName, call.chatId, call.type === "video");
  }

  if (inBackground && Platform.OS !== "web" && !useNative) {
    const deepLink =
      `videh://call/${call.chatId}?callId=${encodeURIComponent(call.callId)}` +
      `&incoming=1&ringing=1&type=${call.type}&name=${encodeURIComponent(call.callerName)}` +
      `&channel=${encodeURIComponent(call.channel)}`;
    void Linking.openURL(deepLink).catch(() => {});
    return { setIncoming: true, broughtToForeground: true };
  }

  return { setIncoming: true, broughtToForeground: false };
}
