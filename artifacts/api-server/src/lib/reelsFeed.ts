import { query } from "./db";
import { getReelsPlatformConfig, type ReelsPlatformConfig } from "./reelsConfig";

export type FeedVideoRow = Record<string, unknown>;

/**
 * YouTube-style feed: subscribers first, then engagement + recency, penalize fraud.
 */
export async function fetchRankedReelsFeed(
  viewerId: number,
  limit: number,
  cursor: number | null,
  config?: ReelsPlatformConfig,
): Promise<{ videos: FeedVideoRow[]; nextCursor: number | null }> {
  const cfg = config ?? await getReelsPlatformConfig();
  const f = cfg.feed;
  const penalty = f.fraudPenaltyMultiplier;

  const result = await query(
    `WITH scored AS (
       SELECT v.*,
              c.handle AS channel_handle,
              c.avatar_url AS channel_avatar_url,
              c.fraud_score AS channel_fraud_score,
              r.reaction AS my_reaction,
              EXISTS(
                SELECT 1 FROM reels_subscriptions s
                WHERE s.channel_id = v.channel_id AND s.subscriber_user_id = $3
              ) AS is_subscribed,
              (
                (CASE WHEN EXISTS(
                  SELECT 1 FROM reels_subscriptions s
                  WHERE s.channel_id = v.channel_id AND s.subscriber_user_id = $3
                ) THEN $4::numeric ELSE 0 END)
                + (CASE WHEN v.created_at > NOW() - ($5::text || ' hours')::interval THEN 20 ELSE 0 END)
                + (v.like_count * $6 + v.comment_count * $7
                   + (v.view_count::numeric / GREATEST(v.duration_seconds, 1)) * $8 * 0.01)
                - (v.fraud_score + COALESCE(c.fraud_score, 0)) * $9
              ) AS rank_score
       FROM reels_videos v
       JOIN reels_channels c ON c.id = v.channel_id
       LEFT JOIN reels_video_reactions r ON r.video_id = v.id AND r.user_id = $3
       WHERE v.status = 'published' AND v.play_enabled = TRUE
         AND ($1::bigint IS NULL OR v.id < $1)
     )
     SELECT * FROM scored
     ORDER BY is_subscribed DESC, rank_score DESC, created_at DESC
     LIMIT $2`,
    [
      cursor,
      limit,
      viewerId || 0,
      f.subscribedChannelBoost,
      f.recencyBoostHours,
      f.weightLikes,
      f.weightComments,
      f.weightWatchHours,
      penalty,
    ],
  );

  const videos = result.rows as FeedVideoRow[];
  const nextCursor = videos.length === limit ? Number(videos[videos.length - 1]?.id) : null;
  return { videos, nextCursor: nextCursor && Number.isFinite(nextCursor) ? nextCursor : null };
}
