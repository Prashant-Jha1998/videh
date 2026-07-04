import { query } from "./db";
import { notifyChannelOwnerContentWarning } from "./reelsNotifications";

export const VIBE_REPORT_REACH_LIMIT = 10;
export const VIBE_REPORT_REMOVE_LIMIT = 20;
/** Feed rank penalty: rank -= fraud_score * fraudPenaltyMultiplier (0.3 default). */
export const VIBE_REPORT_REACH_FRAUD_SCORE = 85;

let tableEnsured = false;

export async function ensureReelsVideoReportsTable(): Promise<void> {
  if (tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS reels_video_reports (
      id SERIAL PRIMARY KEY,
      video_id INTEGER NOT NULL REFERENCES reels_videos(id) ON DELETE CASCADE,
      reporter_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason VARCHAR(120) NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_video_reports_user_dedup
      ON reels_video_reports (video_id, reporter_user_id)
      WHERE reporter_user_id IS NOT NULL
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_reels_video_reports_video
      ON reels_video_reports (video_id, created_at DESC)
  `);
  tableEnsured = true;
}

async function countDistinctReports(videoId: number): Promise<number> {
  const res = await query(
    `SELECT COUNT(DISTINCT reporter_user_id)::int AS c
     FROM reels_video_reports
     WHERE video_id = $1 AND reporter_user_id IS NOT NULL`,
    [videoId],
  );
  return Number(res.rows[0]?.c ?? 0);
}

async function applyReachLimit(videoId: number, reportCount: number): Promise<void> {
  await query(
    `UPDATE reels_videos
     SET fraud_score = GREATEST(fraud_score, $2),
         moderation_details = COALESCE(moderation_details, '{}'::jsonb)
           || jsonb_build_object('reportReachLimitedAt', NOW()::text, 'reportCount', $3::int)
     WHERE id = $1
       AND status = 'published'
       AND play_enabled IS NOT FALSE`,
    [videoId, VIBE_REPORT_REACH_FRAUD_SCORE, reportCount],
  );
}

async function removeForReports(
  videoId: number,
  channelId: number,
  videoTitle: string,
  reportCount: number,
): Promise<void> {
  const res = await query(
    `UPDATE reels_videos
     SET status = 'removed',
         play_enabled = FALSE,
         moderation_status = 'rejected',
         moderation_reason = $2,
         moderation_details = COALESCE(moderation_details, '{}'::jsonb)
           || jsonb_build_object('removedByReportsAt', NOW()::text, 'reportCount', $3::int)
     WHERE id = $1
       AND status <> 'removed'
     RETURNING id`,
    [
      videoId,
      `Removed after ${reportCount} community reports.`,
      reportCount,
    ],
  );
  if (!res.rows.length) return;

  await notifyChannelOwnerContentWarning({
    channelId,
    videoId,
    videoTitle,
    reportCount,
  });
}

export async function submitReelsVideoReport(opts: {
  videoId: number;
  reporterUserId: number;
  reason: string;
  details?: string | null;
}): Promise<{ success: boolean; message: string; alreadyReported?: boolean }> {
  await ensureReelsVideoReportsTable();

  const videoRes = await query(
    `SELECT v.id, v.title, v.channel_id, v.status, v.video_format
     FROM reels_videos v
     WHERE v.id = $1`,
    [opts.videoId],
  );
  if (!videoRes.rows.length) {
    return { success: false, message: "Video not found." };
  }
  const row = videoRes.rows[0] as {
    title?: string;
    channel_id?: number;
    status?: string;
    video_format?: string;
  };
  if (row.status === "removed") {
    return { success: true, message: "This content has already been removed." };
  }

  const inserted = await query(
    `INSERT INTO reels_video_reports (video_id, reporter_user_id, reason, details)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (video_id, reporter_user_id) WHERE reporter_user_id IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [
      opts.videoId,
      opts.reporterUserId,
      opts.reason,
      opts.details?.trim() ? opts.details.trim().slice(0, 2000) : null,
    ],
  );

  const isNewReport = inserted.rows.length > 0;
  if (!isNewReport) {
    return {
      success: true,
      message: "You already reported this clip.",
      alreadyReported: true,
    };
  }

  const reportCount = await countDistinctReports(opts.videoId);
  const channelId = Number(row.channel_id ?? 0);
  const title = String(row.title ?? "Vibe");

  if (reportCount >= VIBE_REPORT_REMOVE_LIMIT) {
    await removeForReports(opts.videoId, channelId, title, reportCount);
    return {
      success: true,
      message: "Report submitted. This content was removed after repeated reports.",
    };
  }

  if (reportCount >= VIBE_REPORT_REACH_LIMIT) {
    await applyReachLimit(opts.videoId, reportCount);
    return {
      success: true,
      message: "Report submitted. Thank you for helping keep Videh safe.",
    };
  }

  return {
    success: true,
    message: "Report submitted. Thank you for helping keep Videh safe.",
  };
}
