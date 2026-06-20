export function isCallKeepAvailable(): boolean {
  return false;
}

export async function setupCallKeep(): Promise<boolean> {
  return false;
}

export function showCallKeepIncoming(
  _callId: string,
  _callerName: string,
  _chatId: number,
  _isVideo: boolean,
): void {}

export function startCallKeepOutgoing(
  _callId: string,
  _contactName: string,
  _isVideo: boolean,
): void {}

export function bringCallKeepToForeground(): void {}

export { setCallKeepHandlers } from "@/lib/callKeepBridge";
