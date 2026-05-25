import { webrtcFetch } from "./webrtcApi";

export async function addUsersToOngoingCall(
  callId: string,
  userIds: number[],
  sessionToken?: string | null,
): Promise<{
  success: boolean;
  addedRinging?: number[];
  busyIds?: number[];
  alreadyOnCall?: number[];
  message?: string;
}> {
  const res = await webrtcFetch(`/calls/${callId}/participants`, sessionToken, {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });
  const data = await res.json() as {
    success?: boolean;
    addedRinging?: number[];
    busyIds?: number[];
    alreadyOnCall?: number[];
    message?: string;
  };
  if (!res.ok || !data.success) {
    return { success: false, message: data.message ?? "Could not add to call." };
  }
  return {
    success: true,
    addedRinging: data.addedRinging,
    busyIds: data.busyIds,
    alreadyOnCall: data.alreadyOnCall,
    message: data.message,
  };
}
