import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { query } from "./db";
import { localPathForUploadsRel, uploadsRelPathFromStoredUrl } from "./mediaStorage";

const execFileAsync = promisify(execFile);

let ffmpegPathCache: string | null | undefined;

async function resolveFfmpegPath(): Promise<string | null> {
  if (ffmpegPathCache !== undefined) return ffmpegPathCache;
  if (process.env.FFMPEG_PATH?.trim()) {
    ffmpegPathCache = process.env.FFMPEG_PATH.trim();
    return ffmpegPathCache;
  }
  try {
    const mod = await import("@ffmpeg-installer/ffmpeg");
    const p = (mod as { default?: { path?: string }; path?: string }).default?.path
      ?? (mod as { path?: string }).path;
    ffmpegPathCache = p ?? "ffmpeg";
  } catch {
    ffmpegPathCache = "ffmpeg";
  }
  return ffmpegPathCache;
}

/** Extract one JPEG frame from a local video file (returns false if ffmpeg missing/fails). */
export async function extractVideoFrameToJpeg(
  videoFilePath: string,
  outputJpegPath: string,
  seekSeconds = 1,
): Promise<boolean> {
  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) return false;
  fs.mkdirSync(path.dirname(outputJpegPath), { recursive: true });
  try {
    await execFileAsync(ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(Math.max(0, seekSeconds)),
      "-i",
      videoFilePath,
      "-frames:v",
      "1",
      "-vf",
      "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
      "-q:v",
      "4",
      "-y",
      outputJpegPath,
    ], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    return fs.existsSync(outputJpegPath) && fs.statSync(outputJpegPath).size > 400;
  } catch {
    return false;
  }
}

function pickSeekSeconds(durationSeconds: number): number {
  const d = Math.max(0, durationSeconds);
  if (d <= 1) return 0;
  if (d <= 10) return 1;
  return Math.min(5, Math.floor(d * 0.1));
}

export function localVideoPathFromStoredUrl(videoStoredUrl: unknown, uploadsRootDir: string): string | null {
  const rel = uploadsRelPathFromStoredUrl(videoStoredUrl);
  if (!rel) return null;
  const local = localPathForUploadsRel(rel, uploadsRootDir);
  if (!local || !fs.existsSync(local)) return null;
  return local;
}

/** Create thumbnail from video file, save under /uploads/reels/, update DB. Returns relative URL. */
export async function ensureVideoThumbnail(opts: {
  videoId: number;
  videoStoredUrl: string;
  uploadsRootDir: string;
  durationSeconds?: number;
}): Promise<string | null> {
  const videoPath = localVideoPathFromStoredUrl(opts.videoStoredUrl, opts.uploadsRootDir);
  if (!videoPath) return null;

  const existing = await query(
    `SELECT thumbnail_url FROM reels_videos WHERE id = $1`,
    [opts.videoId],
  );
  const current = String(existing.rows[0]?.thumbnail_url ?? "").trim();
  if (current) {
    const rel = uploadsRelPathFromStoredUrl(current);
    if (rel) {
      const p = localPathForUploadsRel(rel, opts.uploadsRootDir);
      if (p && fs.existsSync(p)) return rel;
    }
  }

  const thumbName = `thumb_auto_${opts.videoId}.jpg`;
  const thumbRel = `/uploads/reels/${thumbName}`;
  const thumbPath = path.join(opts.uploadsRootDir, "reels", thumbName);
  const seek = pickSeekSeconds(opts.durationSeconds ?? 0);
  const ok = await extractVideoFrameToJpeg(videoPath, thumbPath, seek);
  if (!ok) return null;

  await query(
    `UPDATE reels_videos SET thumbnail_url = $1 WHERE id = $2`,
    [thumbRel, opts.videoId],
  );
  return thumbRel;
}
