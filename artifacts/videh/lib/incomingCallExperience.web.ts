import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { showWebBrowserNotification } from "@/lib/web/webBrowserNotify";
import { startIncomingCallAlert, stopCallAlert } from "@/lib/callRingtone";

let ringingCallId: string | null = null;

export function getRingingCallId(): string | null {
  return ringingCallId;
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
  ringingCallId = null;
  await stopCallAlert();
}

export function presentIncomingCallUi(_call: IncomingCallInfo & { callerName: string }): {
  setIncoming: boolean;
  broughtToForeground: boolean;
} {
  return { setIncoming: true, broughtToForeground: false };
}
