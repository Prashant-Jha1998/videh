type VoiceStopFn = () => void | Promise<void>;

let activeId: string | null = null;
let activeStop: VoiceStopFn | null = null;

export async function claimVoicePlayback(id: string, stopOthers: VoiceStopFn): Promise<void> {
  if (activeId && activeId !== id && activeStop) {
    await activeStop();
  }
  activeId = id;
  activeStop = stopOthers;
}

export function releaseVoicePlayback(id: string): void {
  if (activeId === id) {
    activeId = null;
    activeStop = null;
  }
}
