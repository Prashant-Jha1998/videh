import { NativeEventEmitter, NativeModules, Platform } from "react-native";

type HeyFriendWakeNative = {
  setWakeServiceEnabled?: (enabled: boolean) => void;
  startWakeService?: () => void;
  stopWakeService?: () => void;
  getPendingWake?: () => Promise<string>;
  addListener?: (event: string) => void;
  removeListeners?: (count: number) => void;
};

const native = (NativeModules.HeyFriendWake ?? null) as HeyFriendWakeNative | null;

export function isHeyFriendWakeNativeAvailable(): boolean {
  return Platform.OS === "android" && Boolean(native?.startWakeService);
}

export function setHeyFriendWakePersisted(enabled: boolean): void {
  if (!isHeyFriendWakeNativeAvailable()) return;
  native?.setWakeServiceEnabled?.(enabled);
}

export function startHeyFriendWakeService(): void {
  if (!isHeyFriendWakeNativeAvailable()) return;
  native?.startWakeService?.();
}

export function stopHeyFriendWakeService(): void {
  if (!isHeyFriendWakeNativeAvailable()) return;
  native?.stopWakeService?.();
}

/** Fully stop assistant listening and clear persisted wake flag. */
export function stopHeyFriendWakeFully(): void {
  if (!isHeyFriendWakeNativeAvailable()) return;
  native?.setWakeServiceEnabled?.(false);
}

export async function consumePendingHeyFriendWake(): Promise<string | null> {
  if (!isHeyFriendWakeNativeAvailable() || !native?.getPendingWake) return null;
  try {
    const cmd = await native.getPendingWake();
    const trimmed = String(cmd ?? "").trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

export function subscribeHeyFriendWake(handler: (command: string) => void): () => void {
  if (!isHeyFriendWakeNativeAvailable() || !native) return () => {};
  const emitter = new NativeEventEmitter(native as never);
  const sub = emitter.addListener("VidehHeyFriendWake", (payload: { command?: string }) => {
    const cmd = String(payload?.command ?? "").trim();
    handler(cmd);
  });
  return () => sub.remove();
}
