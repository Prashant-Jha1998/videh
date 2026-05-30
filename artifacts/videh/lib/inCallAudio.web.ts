export function isInCallManagerAvailable(): boolean {
  return false;
}

export function wakeScreenForIncomingCall(): void {}

export async function startInCallSession(_isVideo: boolean): Promise<void> {}

export async function stopInCallSession(): Promise<void> {}

export function applySpeakerRoute(_enabled: boolean, _isVideo: boolean): void {}

export type InCallAudioRoute = "EARPIECE" | "SPEAKER_PHONE" | "BLUETOOTH";

export async function chooseInCallAudioRoute(_route: InCallAudioRoute): Promise<void> {}

export function audioRouteFromSpeakerToggle(speakerOn: boolean, isVideo: boolean): InCallAudioRoute {
  return speakerOn || isVideo ? "SPEAKER_PHONE" : "EARPIECE";
}

export function setProximityScreenOff(_enabled: boolean): void {}

export function startVoiceNotePlaybackSession(): void {}

export function stopVoiceNotePlaybackSession(): void {}
