import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReelsVideo } from "./reelsApi";

const WATCH_LATER_KEY = "reels_watch_later_v1";
const PLAY_QUEUE_KEY = "reels_play_queue_v1";
const WATCH_HISTORY_KEY = "reels_watch_history_v1";
const DOWNLOADS_META_KEY = "reels_downloads_meta_v1";
const NOT_INTERESTED_KEY = "reels_not_interested_v1";
const BLOCKED_CHANNELS_KEY = "reels_blocked_channels_v1";

export type SavedReelsVideo = Pick<
  ReelsVideo,
  "id" | "title" | "thumbnailUrl" | "durationSeconds" | "channelHandle" | "videoUrl"
>;

export type DownloadedReelsVideo = SavedReelsVideo & { localUri: string; savedAt: string };

const MAX_HISTORY = 50;

function normalizeSaved(video: ReelsVideo): SavedReelsVideo {
  return {
    id: video.id,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    durationSeconds: video.durationSeconds,
    channelHandle: video.channelHandle,
    videoUrl: video.videoUrl,
  };
}

async function readList(key: string): Promise<SavedReelsVideo[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedReelsVideo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeList(key: string, list: SavedReelsVideo[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(list));
}

export async function getWatchLaterVideos(): Promise<SavedReelsVideo[]> {
  return readList(WATCH_LATER_KEY);
}

export async function addToWatchLater(video: ReelsVideo): Promise<boolean> {
  const list = await readList(WATCH_LATER_KEY);
  if (list.some((v) => v.id === video.id)) return false;
  list.unshift(normalizeSaved(video));
  await writeList(WATCH_LATER_KEY, list);
  return true;
}

export async function removeFromWatchLater(videoId: number): Promise<void> {
  const list = await readList(WATCH_LATER_KEY);
  await writeList(WATCH_LATER_KEY, list.filter((v) => v.id !== videoId));
}

export async function getWatchHistory(): Promise<SavedReelsVideo[]> {
  return readList(WATCH_HISTORY_KEY);
}

export async function pushWatchHistory(video: ReelsVideo): Promise<void> {
  const list = await readList(WATCH_HISTORY_KEY);
  const next = [normalizeSaved(video), ...list.filter((v) => v.id !== video.id)].slice(0, MAX_HISTORY);
  await writeList(WATCH_HISTORY_KEY, next);
}

export async function clearWatchHistory(): Promise<void> {
  await writeList(WATCH_HISTORY_KEY, []);
}

type DownloadMeta = SavedReelsVideo & { localUri: string; savedAt: string };

async function readDownloadsMeta(): Promise<DownloadMeta[]> {
  try {
    const raw = await AsyncStorage.getItem(DOWNLOADS_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DownloadMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeDownloadsMeta(list: DownloadMeta[]): Promise<void> {
  await AsyncStorage.setItem(DOWNLOADS_META_KEY, JSON.stringify(list.slice(0, 30)));
}

export async function registerDownloadedVideo(video: ReelsVideo, localUri: string): Promise<void> {
  const list = await readDownloadsMeta();
  const next: DownloadMeta[] = [
    { ...normalizeSaved(video), localUri, savedAt: new Date().toISOString() },
    ...list.filter((v) => v.id !== video.id),
  ];
  await writeDownloadsMeta(next);
}

export async function getDownloadedVideos(): Promise<DownloadedReelsVideo[]> {
  return readDownloadsMeta();
}

export async function removeDownloadedVideo(videoId: number): Promise<void> {
  const list = await readDownloadsMeta();
  await writeDownloadsMeta(list.filter((v) => v.id !== videoId));
}

export async function getPlayQueue(): Promise<SavedReelsVideo[]> {
  return readList(PLAY_QUEUE_KEY);
}

export async function addToPlayQueue(video: ReelsVideo): Promise<boolean> {
  const list = await readList(PLAY_QUEUE_KEY);
  if (list.some((v) => v.id === video.id)) return false;
  list.push(normalizeSaved(video));
  await writeList(PLAY_QUEUE_KEY, list);
  return true;
}

export async function removeFromPlayQueue(videoId: number): Promise<void> {
  const list = await readList(PLAY_QUEUE_KEY);
  await writeList(PLAY_QUEUE_KEY, list.filter((v) => v.id !== videoId));
}

async function readIdSet(key: string): Promise<Set<number>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as number[];
    return new Set(Array.isArray(parsed) ? parsed.filter((n) => Number.isFinite(n)) : []);
  } catch {
    return new Set();
  }
}

async function writeIdSet(key: string, ids: Set<number>): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify([...ids]));
}

export async function getNotInterestedVideoIds(): Promise<Set<number>> {
  return readIdSet(NOT_INTERESTED_KEY);
}

export async function addNotInterestedVideo(videoId: number): Promise<void> {
  const ids = await readIdSet(NOT_INTERESTED_KEY);
  ids.add(videoId);
  await writeIdSet(NOT_INTERESTED_KEY, ids);
}

export async function getBlockedChannelIds(): Promise<Set<number>> {
  return readIdSet(BLOCKED_CHANNELS_KEY);
}

export async function addBlockedChannel(channelId: number): Promise<void> {
  const ids = await readIdSet(BLOCKED_CHANNELS_KEY);
  ids.add(channelId);
  await writeIdSet(BLOCKED_CHANNELS_KEY, ids);
}

export async function loadFeedHiddenIds(): Promise<{ videoIds: Set<number>; channelIds: Set<number> }> {
  const [videoIds, channelIds] = await Promise.all([
    getNotInterestedVideoIds(),
    getBlockedChannelIds(),
  ]);
  return { videoIds, channelIds };
}

export function filterFeedVideos(
  videos: ReelsVideo[],
  hidden: { videoIds: Set<number>; channelIds: Set<number> },
): ReelsVideo[] {
  return videos.filter(
    (v) => !hidden.videoIds.has(v.id) && !hidden.channelIds.has(v.channelId),
  );
}
