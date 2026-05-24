export function isInCallManagerAvailable(): boolean {
  return false;
}

export async function startInCallSession(_isVideo: boolean): Promise<void> {}

export async function stopInCallSession(): Promise<void> {}

export function applySpeakerRoute(_enabled: boolean, _isVideo: boolean): void {}

export function setProximityScreenOff(_enabled: boolean): void {}

export function startVoiceNotePlaybackSession(): void {}

export function stopVoiceNotePlaybackSession(): void {}
