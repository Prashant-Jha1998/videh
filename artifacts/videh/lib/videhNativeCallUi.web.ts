import type { NativeIncomingCallPayload } from "./videhNativeCallUi.native";

export type { NativeIncomingCallPayload };

export function displayNativeIncomingCall(_payload: NativeIncomingCallPayload): void {}

export function dismissNativeIncomingCall(): void {}

export function startNativeOngoingCallSession(_isVideo: boolean): void {}
