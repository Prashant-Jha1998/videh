import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db";
import { notifySubscribersNewVideo } from "./reelsNotifications";
import { evaluateChannelMonetization } from "./reelsMonetization";
import { applyVideoModerationResult, moderateReelsUpload } from "./reelsContentModeration";
import { ensureReelsModerationColumns } from "./reelsSchema";

const currentFilePath = fileURLToPath(import.meta.url);
const libDir = path.dirname(currentFilePath);
const apiServerDir = path.resolve(libDir, "../..");
const reelsUploadsDir = path.join(apiServerDir, "uploads", "reels");

export async function processPendingReelsModeration(limit = 10): Promise<number> {
  await ensureReelsModerationColumns();
  const pending = await query(
    `SELECT v.id, v.title, v.description, v.hashtags, v.video_url, v.thumbnail_url,
            v.duration_seconds, c.handle AS channel_handle, v.channel_id
     FROM reels_videos v
     JOIN reels_channels c ON c.id = v.channel_id
     WHERE v.moderation_status IN ('pending_scan', 'pending_review')
     ORDER BY v.created_at ASC
     LIMIT $1`,
    [limit],
  );

  let processed = 0;
  for (const row of pending.rows) {
    const thumbUrl = row.thumbnail_url as string | null;
    let thumbPath: string | null = null;
    if (thumbUrl) {
      const fname = thumbUrl.split("/").pop()?.split("?")[0];
      if (fname) {
        const p = path.join(reelsUploadsDir, fname);
        thumbPath = p;
      }
    }

    const result = await moderateReelsUpload({
      videoId: Number(row.id),
      title: String(row.title ?? ""),
      description: String(row.description ?? ""),
      hashtags: Array.isArray(row.hashtags) ? row.hashtags.map(String) : [],
      thumbnailPath: thumbPath,
      videoPublicUrl: String(row.video_url ?? ""),
      durationSeconds: Number(row.duration_seconds ?? 0),
    });

    await applyVideoModerationResult(Number(row.id), result);

    if (result.action === "approve") {
      void notifySubscribersNewVideo(
        Number(row.channel_id),
        Number(row.id),
        String(row.title),
        String(row.channel_handle),
      );
      void evaluateChannelMonetization(Number(row.channel_id));
    }

    processed += 1;
  }
  return processed;
}
