import fs from "node:fs";
import path from "node:path";
import { query } from "./db";
import { localPathForUploadsRel, uploadsRelPathFromStoredUrl } from "./mediaStorage";
import { deleteS3ObjectByUploadsRel } from "./s3Storage";

function tryUnlinkStoredUpload(url: unknown, uploadsRootDir: string): void {
  const rel = uploadsRelPathFromStoredUrl(url);
  if (!rel) return;
  const local = localPathForUploadsRel(rel, uploadsRootDir);
  if (!local) return;
  try {
    if (fs.existsSync(local)) fs.unlinkSync(local);
  } catch {
    /* best effort */
  }
}

/** Permanently remove a reels video, its upload files, and all related DB rows (CASCADE). */
export async function permanentlyDeleteReelsVideo(
  videoId: number,
  uploadsRootDir: string,
): Promise<boolean> {
  const meta = await query(
    `SELECT video_url, thumbnail_url FROM reels_videos WHERE id = $1`,
    [videoId],
  );
  if (!meta.rows.length) return false;

  const row = meta.rows[0] as { video_url?: string | null; thumbnail_url?: string | null };
  tryUnlinkStoredUpload(row.video_url, uploadsRootDir);
  tryUnlinkStoredUpload(row.thumbnail_url, uploadsRootDir);
  tryUnlinkStoredUpload(`/uploads/reels/thumb_auto_${videoId}.jpg`, uploadsRootDir);
  await deleteS3ObjectByUploadsRel(row.video_url);
  await deleteS3ObjectByUploadsRel(row.thumbnail_url);
  await deleteS3ObjectByUploadsRel(`/uploads/reels/thumb_auto_${videoId}.jpg`);
  await deleteS3ObjectByUploadsRel(`/uploads/reels/variants/${videoId}_1080.mp4`);
  await deleteS3ObjectByUploadsRel(`/uploads/reels/variants/${videoId}_720.mp4`);
  await deleteS3ObjectByUploadsRel(`/uploads/reels/variants/${videoId}_480.mp4`);
  await deleteS3ObjectByUploadsRel(`/uploads/reels/variants/${videoId}_360.mp4`);
  await deleteS3ObjectByUploadsRel(`/uploads/reels/variants/${videoId}_240.mp4`);
  await deleteS3ObjectByUploadsRel(`/uploads/reels/variants/${videoId}_144.mp4`);

  await query(`DELETE FROM reels_videos WHERE id = $1`, [videoId]);
  return true;
}
