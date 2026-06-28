import type { ReelsVideo } from "./reelsApi";

const STORAGE_KEY = "videh_watch_history";
const MAX_ITEMS = 50;

export type LocalHistoryEntry = {
  video: ReelsVideo;
  watchedAt: string;
};

function loadRaw(): LocalHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getLocalWatchHistory(): LocalHistoryEntry[] {
  return loadRaw().sort(
    (a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime(),
  );
}

export function pushWatchHistory(video: ReelsVideo): void {
  const now = new Date().toISOString();
  const next = [
    { video, watchedAt: now },
    ...loadRaw().filter((e) => e.video.id !== video.id),
  ].slice(0, MAX_ITEMS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearLocalWatchHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
