import { query } from "./db";

export type HashtagStatRow = {
  tag: string;
  videoCount: number;
  viewCount: number;
};

const HIDDEN_TAG_SQL = `
  NOT (LOWER(BTRIM(tag)) LIKE 'videh_official_%')
  AND LOWER(BTRIM(tag)) NOT IN ('videh_official_seed')
`;

function mapHashtagRow(row: Record<string, unknown>): HashtagStatRow {
  return {
    tag: String(row.tag ?? "").toLowerCase(),
    videoCount: Number(row.video_count ?? 0),
    viewCount: Number(row.view_count ?? 0),
  };
}

/** Trending or prefix-matched hashtags with video + view totals. */
export async function fetchHashtagSuggestions(
  prefix: string,
  limit = 10,
): Promise<HashtagStatRow[]> {
  const q = prefix.trim().toLowerCase().replace(/^#/, "");
  const capped = Math.min(20, Math.max(1, limit));

  const result = q.length > 0
    ? await query(
        `WITH tagged AS (
           SELECT LOWER(BTRIM(tag)) AS tag, v.view_count
           FROM reels_videos v
           CROSS JOIN LATERAL unnest(v.hashtags) AS tag
           WHERE v.status = 'published' AND v.play_enabled = TRUE
             AND BTRIM(tag) <> ''
             AND ${HIDDEN_TAG_SQL}
         )
         SELECT tag,
                COUNT(*)::int AS video_count,
                COALESCE(SUM(view_count), 0)::bigint AS view_count
         FROM tagged
         WHERE tag LIKE $1
         GROUP BY tag
         ORDER BY video_count DESC, view_count DESC, tag ASC
         LIMIT $2`,
        [`%${q}%`, capped],
      )
    : await query(
        `WITH tagged AS (
           SELECT LOWER(BTRIM(tag)) AS tag, v.view_count
           FROM reels_videos v
           CROSS JOIN LATERAL unnest(v.hashtags) AS tag
           WHERE v.status = 'published' AND v.play_enabled = TRUE
             AND BTRIM(tag) <> ''
             AND ${HIDDEN_TAG_SQL}
         )
         SELECT tag,
                COUNT(*)::int AS video_count,
                COALESCE(SUM(view_count), 0)::bigint AS view_count
         FROM tagged
         GROUP BY tag
         ORDER BY view_count DESC, video_count DESC, tag ASC
         LIMIT $1`,
        [capped],
      );

  return result.rows.map((r) => mapHashtagRow(r as Record<string, unknown>));
}

export async function fetchHashtagStats(tag: string): Promise<HashtagStatRow | null> {
  const normalized = tag.trim().toLowerCase().replace(/^#/, "");
  if (!normalized) return null;

  const result = await query(
    `WITH tagged AS (
       SELECT LOWER(BTRIM(tag)) AS tag, v.view_count
       FROM reels_videos v
       CROSS JOIN LATERAL unnest(v.hashtags) AS tag
       WHERE v.status = 'published' AND v.play_enabled = TRUE
         AND BTRIM(tag) <> ''
         AND ${HIDDEN_TAG_SQL}
     )
     SELECT tag,
            COUNT(*)::int AS video_count,
            COALESCE(SUM(view_count), 0)::bigint AS view_count
     FROM tagged
     WHERE tag = $1
     GROUP BY tag`,
    [normalized],
  );

  if (result.rows.length === 0) {
    return { tag: normalized, videoCount: 0, viewCount: 0 };
  }
  return mapHashtagRow(result.rows[0] as Record<string, unknown>);
}
