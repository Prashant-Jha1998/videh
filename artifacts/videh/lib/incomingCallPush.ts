import * as Linking from "expo-linking";
import { Platform } from "react-native";
import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { setupCallKeep, showCallKeepIncoming } from "@/lib/callKeep";
import { displayNativeIncomingCall } from "@/lib/videhNativeCallUi";
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
  };
}

function incomingCallDeepLink(call: IncomingCallInfo & { callerName: string }): string {
  return (
    `videh://call/${call.chatId}?callId=${encodeURIComponent(call.callId)}` +
    `&incoming=1&ringing=1&type=${call.type}&name=${encodeURIComponent(call.callerName)}` +
    `&channel=${encodeURIComponent(call.channel)}`
  );
}

/** Runs in foreground, background, or headless JS when a call push arrives. */
export async function presentIncomingCallFromPush(
  data: Record<string, unknown>,
  options?: { scheduleLocalNotification?: boolean },
): Promise<void> {
  if (Platform.OS === "web" || !isIncomingCallPushData(data)) return;

  const call = parseIncomingCallFromPushData(data);
  await setupCallKeep();
  displayNativeIncomingCall({
    callId: call.callId,
    callerName: call.callerName,
    isVideo: call.type === "video",
  });
  showCallKeepIncoming(call.callId, call.callerName, call.chatId, call.type === "video");

  if (options?.scheduleLocalNotification !== false) {
    await showIncomingCallNotification(call);
  }

  void Linking.openURL(incomingCallDeepLink(call)).catch(() => {});
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
