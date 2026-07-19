import * as Linking from "expo-linking";
import { AppState, Platform } from "react-native";
import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { isCallKeepAvailable, setupCallKeep, showCallKeepIncoming } from "@/lib/callKeep";
import { wakeScreenForIncomingCall } from "@/lib/inCallAudio";
import {
  presentIncomingCallUi,
  startIncomingCallExperience,
  isIncomingCallAlreadyHandled,
  shouldPresentIncomingCallSurfaces,
  hasIncomingCallSurfaces,
} from "@/lib/incomingCallExperience";
import { showIncomingCallNotification } from "@/lib/incomingCallNotification";

export function isIncomingCallPushData(data: Record<string, unknown> | null | undefined): boolean {
  if (!data?.callId) return false;
  return data.kind === "call" || data.notificationKind === "incoming_call";
}

export function parseIncomingCallFromPushData(data: Record<string, unknown>): IncomingCallInfo & { callerName: string } {
  return {
    callId: String(data.callId),
    channel: String(data.channel ?? ""),
    chatId: Number(data.chatId),
    type: data.type === "video" ? "video" : "audio",
    callerName: String(data.callerName ?? "Videh user"),
    participantCount: Number(data.participantCount ?? 2),
    callerId: data.callerId != null ? Number(data.callerId) : undefined,
  };
}

function incomingCallDeepLink(call: IncomingCallInfo & { callerName: string }): string {
  const callerPart = call.callerId ? `&callerId=${call.callerId}` : "";
  return (
    `videh://call/${call.chatId}?callId=${encodeURIComponent(call.callId)}` +
    `&incoming=1&ringing=1&type=${call.type}&name=${encodeURIComponent(call.callerName)}` +
    `&channel=${encodeURIComponent(call.channel)}${callerPart}`
  );
}

export type PresentIncomingCallFromPushOptions = {
  /** Schedule local notification with full-screen intent (Android). Default: true when background. */
  scheduleLocalNotification?: boolean;
  /** Skip CallKeep when foreground overlay will handle the call. */
  skipCallKeep?: boolean;
};

/** Runs in foreground, background, or headless JS when a call push arrives. */
export async function presentIncomingCallFromPush(
  data: Record<string, unknown>,
  options?: PresentIncomingCallFromPushOptions,
): Promise<void> {
  if (Platform.OS === "web" || !isIncomingCallPushData(data)) return;

  const call = parseIncomingCallFromPushData(data);
  if (isIncomingCallAlreadyHandled(call.callId)) return;
  if (hasIncomingCallSurfaces(call.callId)) return;

  const inForeground = AppState.currentState === "active";
  try {
    const { loadNotificationPrefs } = await import("./notificationPrefs");
    const prefs = await loadNotificationPrefs();
    if (!prefs.calls) return;
  } catch {
    /* deliver by default */
  }

  const presentSurfaces = shouldPresentIncomingCallSurfaces(call.callId);
  if (!presentSurfaces) return;

  wakeScreenForIncomingCall();
  await setupCallKeep();

  if (!inForeground) {
    if (Platform.OS === "android") {
      await showIncomingCallNotification(call);
    } else if (!options?.skipCallKeep) {
      showCallKeepIncoming(call.callId, call.callerName, call.chatId, call.type === "video");
    }
  }

  await startIncomingCallExperience(call);

  if (!inForeground && Platform.OS === "ios") {
    presentIncomingCallUi(call, { useNativeSurface: !options?.skipCallKeep });
    if (!isCallKeepAvailable() && presentSurfaces) {
      void Linking.openURL(incomingCallDeepLink(call)).catch(() => {});
    }
  }
}

export function extractPushDataFromTaskPayload(
  taskData: import("expo-notifications").NotificationTaskPayload,
): Record<string, unknown> | null {
  if ("actionIdentifier" in taskData) {
    const content = taskData.notification?.request?.content;
    return (content?.data as Record<string, unknown> | undefined) ?? null;
  }

  const remote = taskData;
  let parsed: Record<string, unknown> = {};
  const dataString = remote.data?.dataString;
  if (typeof dataString === "string" && dataString.length > 0) {
    try {
      parsed = JSON.parse(dataString) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }

  const merged: Record<string, unknown> = { ...remote.data, ...parsed };
  delete merged.dataString;
  return merged;
}
