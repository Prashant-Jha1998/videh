import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { showWebBrowserNotification } from "@/lib/web/webBrowserNotify";
import { startIncomingCallAlert, stopCallAlert } from "@/lib/callRingtone";

let ringingCallId: string | null = null;
let surfacesPresentedFor: string | null = null;
const handledCallIds = new Set<string>();

export function getRingingCallId(): string | null {
  return ringingCallId;
}

export function isIncomingCallAlreadyHandled(callId: string): boolean {
  return handledCallIds.has(callId);
}

export function shouldPresentIncomingCallSurfaces(callId: string): boolean {
  if (handledCallIds.has(callId)) return false;
  if (surfacesPresentedFor === callId) return false;
  surfacesPresentedFor = callId;
  return true;
}

export function markIncomingCallHandled(callId: string): void {
  handledCallIds.add(callId);
  setTimeout(() => handledCallIds.delete(callId), 10 * 60_000);
  if (ringingCallId === callId) ringingCallId = null;
  if (surfacesPresentedFor === callId) surfacesPresentedFor = null;
}

export function isAppInForeground(): boolean {
  return typeof document !== "undefined" ? document.visibilityState === "visible" : true;
}

export function claimIncomingCallRing(callId: string): boolean {
  if (ringingCallId === callId) return false;
  ringingCallId = callId;
  return true;
}

export async function startIncomingCallExperience(call: IncomingCallInfo & { callerName: string }): Promise<void> {
  if (ringingCallId !== call.callId) ringingCallId = call.callId;
  await startIncomingCallAlert();
  showWebBrowserNotification(
    call.type === "video" ? "Incoming video call" : "Incoming voice call",
    call.callerName,
    {
      tag: `call-${call.callId}`,
      requireInteraction: true,
      data: { callId: call.callId, chatId: String(call.chatId) },
      onClick: () => {
        if (typeof window !== "undefined") {
          window.focus();
        }
      },
    },
  );
}

export async function stopIncomingCallExperience(callId?: string): Promise<void> {
  if (callId && ringingCallId && ringingCallId !== callId) return;
  if (callId) markIncomingCallHandled(callId);
  else {
    ringingCallId = null;
    surfacesPresentedFor = null;
  }
  await stopCallAlert();
}

export function presentIncomingCallUi(_call: IncomingCallInfo & { callerName: string }): {
  setIncoming: boolean;
  broughtToForeground: boolean;
} {
  return { setIncoming: true, broughtToForeground: false };
}
