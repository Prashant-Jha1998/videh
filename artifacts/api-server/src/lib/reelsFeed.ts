import { query } from "./db";
import { getReelsPlatformConfig, type ReelsFeedRules, type ReelsPlatformConfig } from "./reelsConfig";

export type FeedVideoRow = Record<string, unknown>;

/** Keyset cursor for engagement-ranked home feed. */
export type EngagementFeedCursor = { score: number; id: number };

/** @deprecated Chronological cursor — kept for backward compatibility. */
export type FeedCursor = { at: string; id: number };

const FEED_BASE_SELECT = `
  SELECT v.*,
         c.handle AS channel_handle,
         c.display_name AS channel_display_name,
         c.avatar_url AS channel_avatar_url,
         c.updated_at AS channel_updated_at,
         r.reaction AS my_reaction
  FROM reels_videos v
  JOIN reels_channels c ON c.id = v.channel_id
  LEFT JOIN reels_video_reactions r ON r.video_id = v.id AND r.user_id = $1
  WHERE v.status = 'published' AND v.play_enabled = TRUE
`;

/**
 * Engagement score for feed ranking.
 * Likes signal content quality (reach boost). Comments signal active engagement (wider distribution).
 * Watch time (view depth) still counts but with a lower weight than likes/comments.
 */
export function engagementRankScoreSql(
  viewerIdParam: string,
  rules: ReelsFeedRules,
  fraudPenalty: number,
): string {
  return `(
    (CASE WHEN EXISTS(
      SELECT 1 FROM reels_subscriptions s
      WHERE s.channel_id = v.channel_id AND s.subscriber_user_id = ${viewerIdParam}
    ) THEN $4::numeric ELSE 0 END)
    + (CASE WHEN v.created_at > NOW() - ($5::text || ' hours')::interval THEN 20 ELSE 0 END)
    + (v.like_count * $6::numeric)
    + (v.comment_count * $7::numeric)
    + (v.view_count::numeric / GREATEST(v.duration_seconds, 1)) * $8::numeric * 0.01
    - (v.fraud_score + COALESCE(c.fraud_score, 0)) * $9::numeric
  )`;
}

/**
 * Trending: high engagement velocity in the last 30 days.
 */
export async function fetchTrendingReels(
  viewerId: number,
  limit = 12,
): Promise<FeedVideoRow[]> {
  const result = await query(
    `${FEED_BASE_SELECT}
       AND v.created_at > NOW() - INTERVAL '30 days'
     ORDER BY (
       (v.view_count::numeric * 1.0
        + v.like_count * 10
        + v.comment_count * 14
        + COALESCE(v.share_count, 0) * 12)
       / (EXTRACT(EPOCH FROM (NOW() - v.created_at)) / 3600.0 + 2.0)
     ) DESC,
     v.created_at DESC
     LIMIT $2`,
    [viewerId || 0, limit],
  );
  return result.rows as FeedVideoRow[];
}

/**
 * Home feed: engagement-ranked (likes, comments, watch depth) with subscription + recency boosts.
 */
export async function fetchEngagementHomeFeed(
  viewerId: number,
  limit: number,
  cursor: EngagementFeedCursor | null,
  config?: ReelsPlatformConfig,
): Promise<{ videos: FeedVideoRow[]; nextCursor: EngagementFeedCursor | null }> {
  const cfg = config ?? await getReelsPlatformConfig();
  const f = cfg.feed;
  const penalty = f.fraudPenaltyMultiplier;
  const rankExpr = engagementRankScoreSql("$3", f, penalty);

  const result = await query(
    `WITH scored AS (
       SELECT v.*,
              c.handle AS channel_handle,
              c.display_name AS channel_display_name,
              c.avatar_url AS channel_avatar_url,
              c.updated_at AS channel_updated_at,
              c.fraud_score AS channel_fraud_score,
              r.reaction AS my_reaction,
              EXISTS(
                SELECT 1 FROM reels_subscriptions s
                WHERE s.channel_id = v.channel_id AND s.subscriber_user_id = $3
              ) AS is_subscribed,
              ${rankExpr} AS rank_score
       FROM reels_videos v
       JOIN reels_channels c ON c.id = v.channel_id
       LEFT JOIN reels_video_reactions r ON r.video_id = v.id AND r.user_id = $3
       WHERE v.status = 'published' AND v.play_enabled = TRUE
     )
     SELECT * FROM scored
     WHERE (
       $1::numeric IS NULL
       OR rank_score < $1::numeric
       OR (rank_score = $1::numeric AND id < $2::bigint)
     )
     ORDER BY is_subscribed DESC, rank_score DESC, id DESC
     LIMIT $10`,
    [
      cursor?.score ?? null,
      cursor?.id ?? 0,
      viewerId || 0,
      f.subscribedChannelBoost,
      f.recencyBoostHours,
      f.weightLikes,
      f.weightComments,
      f.weightWatchHours,
      penalty,
      limit,
    ],
  );

  const videos = result.rows as FeedVideoRow[];
  if (videos.length < limit) {
    return { videos, nextCursor: null };
  }
  const last = videos[videos.length - 1];
  const id = Number(last?.id);
  const score = Number(last?.rank_score);
  if (!Number.isFinite(id) || !Number.isFinite(score)) {
    return { videos, nextCursor: null };
  }
  return { videos, nextCursor: { score, id } };
}

/**
 * Latest-first home feed with keyset pagination (never-ending scroll).
 * @deprecated Prefer fetchEngagementHomeFeed for the main Videh video tab.
 */
export async function fetchLatestReelsFeed(
  viewerId: number,
  limit: number,
  cursor: FeedCursor | null,
): Promise<{ videos: FeedVideoRow[]; nextCursor: FeedCursor | null }> {
  const result = await query(
    `${FEED_BASE_SELECT}
       AND (
         $2::timestamptz IS NULL
         OR v.created_at < $2::timestamptz
         OR (v.created_at = $2::timestamptz AND v.id < $3::bigint)
       )
     ORDER BY v.created_at DESC, v.id DESC
     LIMIT $4`,
    [
      viewerId || 0,
      cursor?.at ?? null,
      cursor?.id ?? 0,
      limit,
    ],
  );

  const videos = result.rows as FeedVideoRow[];
  if (videos.length < limit) {
    return { videos, nextCursor: null };
  }
  const last = videos[videos.length - 1];
  const at = last?.created_at;
  const id = Number(last?.id);
  if (!at || !Number.isFinite(id)) {
    return { videos, nextCursor: null };
  }
  return {
    videos,
    nextCursor: { at: new Date(String(at)).toISOString(), id },
  };
}

/**
 * Legacy ranked feed (subscriptions + engagement). Kept for admin/other use.
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
  const rankExpr = engagementRankScoreSql("$3", f, penalty);

  const result = await query(
    `WITH scored AS (
       SELECT v.*,
              c.handle AS channel_handle,
              c.display_name AS channel_display_name,
              c.avatar_url AS channel_avatar_url,
              c.updated_at AS channel_updated_at,
              c.fraud_score AS channel_fraud_score,
              r.reaction AS my_reaction,
              EXISTS(
                SELECT 1 FROM reels_subscriptions s
                WHERE s.channel_id = v.channel_id AND s.subscriber_user_id = $3
              ) AS is_subscribed,
              ${rankExpr} AS rank_score
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
