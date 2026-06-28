import type { ReelsVideo } from "./reelsApi";
import { videoStreamUrl, videoThumbnailSrc } from "./reelsApi";

const META_KEY = "videh_offline_downloads";
const CACHE_NAME = "videh-offline-v1";

export type OfflineVideo = {
  video: ReelsVideo;
  savedAt: string;
};

function loadMeta(): OfflineVideo[] {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineVideo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMeta(items: OfflineVideo[]): void {
  localStorage.setItem(META_KEY, JSON.stringify(items.slice(0, 30)));
}

async function cacheUrl(key: string, url: string): Promise<boolean> {
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return false;
    await cache.put(key, res.clone());
    return true;
  } catch {
    return false;
  }
}

export function listOfflineVideos(): OfflineVideo[] {
  return loadMeta().sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export async function saveVideoOffline(
  video: ReelsVideo,
): Promise<{ ok: boolean; message?: string }> {
  const streamUrl = videoStreamUrl(video.id);
  const thumbUrl = videoThumbnailSrc(video);
  const [videoCached, thumbCached] = await Promise.all([
    cacheUrl(`/offline/video/${video.id}`, streamUrl),
    cacheUrl(`/offline/thumb/${video.id}`, thumbUrl),
  ]);
  if (!videoCached) {
    return { ok: false, message: "Could not save video for offline. Try again on Wi‑Fi." };
  }
  const next = [
    { video, savedAt: new Date().toISOString() },
    ...loadMeta().filter((e) => e.video.id !== video.id),
  ];
  saveMeta(next);
  if (!thumbCached) {
    return { ok: true, message: "Video saved (thumbnail may load when online)." };
  }
  return { ok: true };
}

export async function removeOfflineVideo(videoId: number): Promise<void> {
  saveMeta(loadMeta().filter((e) => e.video.id !== videoId));
  if ("caches" in window) {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(`/offline/video/${videoId}`);
    await cache.delete(`/offline/thumb/${videoId}`);
  }
}

export async function offlineVideoStreamUrl(videoId: number): Promise<string | null> {
  if (!("caches" in window)) return null;
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(`/offline/video/${videoId}`);
  if (!hit) return null;
  const blob = await hit.blob();
  return URL.createObjectURL(blob);
}

export async function offlineThumbnailUrl(videoId: number): Promise<string | null> {
  if (!("caches" in window)) return null;
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(`/offline/thumb/${videoId}`);
  if (!hit) return null;
  const blob = await hit.blob();
  return URL.createObjectURL(blob);
}
