import { endCallKeep } from "@/lib/callKeep";
import { dismissAllIncomingCallNotifications } from "@/lib/incomingCallNotification";
import { requestDismissIncomingCallUi } from "@/lib/incomingCallUiBridge";
import { stopCallAlert } from "@/lib/callRingtone";
import { webrtcFetch } from "@/lib/webrtcApi";

const rejectInFlight = new Set<string>();

/** Decline an incoming call on the server and stop ringtone / CallKeep / notifications. */
export async function rejectIncomingCall(args: {
  callId: string;
  userId: number;
  sessionToken?: string | null;
  declineMessage?: string;
}): Promise<boolean> {
  const { callId, userId, sessionToken, declineMessage } = args;
  if (!callId || !userId) return false;
  if (rejectInFlight.has(callId)) {
    await stopCallAlert();
    requestDismissIncomingCallUi(callId, true);
    return false;
  }
  rejectInFlight.add(callId);
  try {
    await stopCallAlert();
    endCallKeep(callId, "declined");
    const res = await webrtcFetch(`/calls/${callId}/respond`, sessionToken, {
      method: "POST",
      body: JSON.stringify({
        userId,
        action: "decline",
        ...(declineMessage ? { declineMessage } : {}),
      }),
    });
    await dismissAllIncomingCallNotifications(callId).catch(() => {});
    requestDismissIncomingCallUi(callId, true);
    return res.ok;
  } catch {
    return false;
  } finally {
    rejectInFlight.delete(callId);
  }
}
