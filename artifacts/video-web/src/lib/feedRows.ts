import type { ReelsFeedAd, ReelsFeedAdPlacement, ReelsVideo } from "@/lib/reelsApi";

export type FeedRow =
  | { kind: "video"; key: string; video: ReelsVideo }
  | { kind: "ad"; key: string; ad: ReelsFeedAd };

export function buildFeedRows(videos: ReelsVideo[], placements: ReelsFeedAdPlacement[]): FeedRow[] {
  const adAfter = new Map<number, ReelsFeedAd>();
  for (const p of placements) adAfter.set(p.insertAfterIndex, p.ad);
  const rows: FeedRow[] = [];
  for (let i = 0; i < videos.length; i++) {
    rows.push({ kind: "video", key: `v-${videos[i].id}`, video: videos[i] });
    const ad = adAfter.get(i);
    if (ad) rows.push({ kind: "ad", key: `ad-${ad.id}-${i}`, ad });
  }
  return rows;
}
