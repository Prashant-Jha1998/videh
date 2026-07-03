import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchReelsFeed, type ReelsFeedAdPlacement, type ReelsFeedCursor, type ReelsVideo, type ReelsVibeAdPlacement } from "@/lib/reelsApi";
import { safeJsonParse } from "@/lib/safeJson";

const CACHE_VERSION = 3;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type CachedReelsFeed = {
  videos: ReelsVideo[];
  trending: ReelsVideo[];
  adPlacements: ReelsFeedAdPlacement[];
  vibeAdPlacements: ReelsVibeAdPlacement[];
  nextCursor: ReelsFeedCursor | null;
  savedAt: number;
};

const memoryCache = new Map<number, CachedReelsFeed>();

function cacheKey(userId: number) {
  return `videh_reels_feed_v${CACHE_VERSION}_${userId}`;
}

export async function loadReelsFeedCache(userId: number): Promise<CachedReelsFeed | null> {
  const mem = memoryCache.get(userId);
  if (mem) return mem;

  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = safeJsonParse<CachedReelsFeed | null>(raw, null);
    if (!parsed?.videos?.length) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > MAX_AGE_MS) return null;
    memoryCache.set(userId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function saveReelsFeedCache(
  userId: number,
  feed: {
    videos: ReelsVideo[];
    trending?: ReelsVideo[];
    adPlacements?: ReelsFeedAdPlacement[];
    vibeAdPlacements?: ReelsVibeAdPlacement[];
    nextCursor?: ReelsFeedCursor | null;
  },
): Promise<void> {
  const payload: CachedReelsFeed = {
    videos: feed.videos,
    trending: feed.trending ?? [],
    adPlacements: feed.adPlacements ?? [],
    vibeAdPlacements: feed.vibeAdPlacements ?? [],
    nextCursor: feed.nextCursor ?? null,
    savedAt: Date.now(),
  };
  memoryCache.set(userId, payload);
  try {
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Warm feed cache in background so Video tab opens instantly (in-stream video). */
export async function prefetchReelsFeed(userId: number, sessionToken?: string | null): Promise<void> {
  if (!userId) return;
  try {
    const feed = await fetchReelsFeed(userId, null, sessionToken);
    if ((feed.videos ?? []).length > 0) {
      await saveReelsFeedCache(userId, {
        videos: feed.videos ?? [],
        trending: feed.trending,
        adPlacements: feed.feedAdPlacements,
        vibeAdPlacements: feed.vibeAdPlacements,
        nextCursor: feed.nextCursor,
      });
    }
  } catch {
    /* ignore */
  }
}
