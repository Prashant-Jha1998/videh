export function isHeyFriendWakeNativeAvailable(): boolean {
  return false;
}

export function setHeyFriendWakePersisted(_enabled: boolean): void {}

export function startHeyFriendWakeService(): void {}

export function stopHeyFriendWakeService(): void {}

export async function consumePendingHeyFriendWake(): Promise<string | null> {
  return null;
}

export function subscribeHeyFriendWake(_handler: (command: string) => void): () => void {
  return () => {};
}
