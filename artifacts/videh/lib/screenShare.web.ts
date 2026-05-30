export type ScreenShareState = {
  active: boolean;
  streamUrl?: string;
};

let screenStream: MediaStream | null = null;

export function isScreenShareSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
}

export async function startScreenShare(): Promise<MediaStream | null> {
  if (!isScreenShareSupported()) return null;
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    return screenStream;
  } catch {
    return null;
  }
}

export async function stopScreenShare(): Promise<void> {
  screenStream?.getTracks().forEach((t) => t.stop());
  screenStream = null;
}
