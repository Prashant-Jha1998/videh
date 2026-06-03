import { Platform } from "react-native";
import {
  dispatchCallKeepAnswer,
  dispatchCallKeepEnd,
  registerCallKeepMeta,
  unregisterCallKeep,
} from "@/lib/callKeepBridge";

export { setCallKeepHandlers } from "@/lib/callKeepBridge";

let RNCallKeep: {
  setup: (opts: Record<string, unknown>) => Promise<boolean>;
  setAvailable: (available: boolean) => void;
  displayIncomingCall: (
    uuid: string,
    handle: string,
    localizedCallerName: string,
    handleType: string,
    hasVideo: boolean,
  ) => void;
  startCall: (uuid: string, handle: string, contactIdentifier: string, hasVideo: boolean) => void;
  endCall: (uuid: string) => void;
  reportEndCallWithUUID: (uuid: string, reason: number) => void;
  addEventListener: (event: string, handler: (p: { callUUID: string }) => void) => void;
  removeEventListener: (event: string) => void;
} | null = null;

let setupDone = false;

try {
  RNCallKeep = require("react-native-callkeep").default;
} catch {
  RNCallKeep = null;
}

const END_CALL_REASONS = { REMOTE_ENDED: 2, ANSWERED_ELSEWHERE: 3, DECLINED: 6 };

export function isCallKeepAvailable(): boolean {
  return Platform.OS !== "web" && RNCallKeep != null;
}

export async function setupCallKeep(): Promise<boolean> {
  if (!RNCallKeep || setupDone) return setupDone;
  try {
    await RNCallKeep.setup({
      ios: {
        appName: "Videh",
        supportsVideo: true,
        maximumCallGroups: 8,
        maximumCallsPerCallGroup: 8,
        includesCallsInRecents: true,
      },
      android: {
        alertTitle: "Permissions required",
        alertDescription: "Videh needs phone account access for incoming calls",
        cancelButton: "Cancel",
        okButton: "OK",
        additionalPermissions: [],
        selfManaged: true,
        foregroundService: {
          channelId: "calls",
          channelName: "Calls",
          notificationTitle: "Videh call in progress",
        },
      },
    });
    RNCallKeep.setAvailable(true);
    RNCallKeep.addEventListener("answerCall", ({ callUUID }) => {
      dispatchCallKeepAnswer(callUUID);
    });
    RNCallKeep.addEventListener("endCall", ({ callUUID }) => {
      dispatchCallKeepEnd(callUUID);
    });
    setupDone = true;
    return true;
  } catch {
    return false;
  }
}

export function showCallKeepIncoming(
  callId: string,
  callerName: string,
  chatId: number,
  isVideo: boolean,
): void {
  if (!RNCallKeep) return;
  const uuid = registerCallKeepMeta(callId, { chatId });
  const handle = callerName || "Videh";
  try {
    RNCallKeep.displayIncomingCall(uuid, handle, handle, "generic", isVideo);
  } catch {
    /* ignore */
  }
}

export function startCallKeepOutgoing(
  callId: string,
  contactName: string,
  isVideo: boolean,
): void {
  if (!RNCallKeep) return;
  const uuid = registerCallKeepMeta(callId, {});
  try {
    RNCallKeep.startCall(uuid, contactName, contactName, isVideo);
  } catch {
    /* ignore */
  }
}

export function endCallKeep(callId: string, reason: "declined" | "remote" = "remote"): void {
  if (!RNCallKeep) return;
  const uuid = callId;
  try {
    const code = reason === "declined" ? END_CALL_REASONS.DECLINED : END_CALL_REASONS.REMOTE_ENDED;
    RNCallKeep.reportEndCallWithUUID(uuid, code);
    RNCallKeep.endCall(uuid);
  } catch {
    /* ignore */
  }
  unregisterCallKeep(callId);
}
