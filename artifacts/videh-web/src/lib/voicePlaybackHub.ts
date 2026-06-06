let activeId: string | null = null;
const listeners = new Map<string, () => void>();

export function claimVoicePlayback(id: string) {
  if (activeId === id) return;
  const prev = activeId;
  activeId = id;
  if (prev) listeners.get(prev)?.();
}

export function releaseVoicePlayback(id: string) {
  if (activeId === id) activeId = null;
}

export function subscribeVoicePlayback(id: string, onStop: () => void) {
  listeners.set(id, onStop);
  return () => {
    if (listeners.get(id) === onStop) listeners.delete(id);
  };
}
