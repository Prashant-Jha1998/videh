import type { IncomingCallInfo } from "@/components/IncomingCallOverlay";
import { showWebBrowserNotification } from "@/lib/web/webBrowserNotify";

export async function showIncomingCallNotification(call: IncomingCallInfo & { callerName: string }): Promise<void> {
  showWebBrowserNotification(
    call.type === "video" ? "Incoming video call" : "Incoming voice call",
    call.callerName,
    {
      tag: `call-${call.callId}`,
      requireInteraction: true,
      data: { callId: call.callId },
    },
  );
}

export async function dismissIncomingCallNotification(_callId: string): Promise<void> {
  /* replaced by tag on next notification */
}
