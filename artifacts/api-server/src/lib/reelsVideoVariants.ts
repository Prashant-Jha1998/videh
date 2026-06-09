import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { localPathForUploadsRel, uploadsRelFromLocalPath, uploadsRelPathFromStoredUrl } from "./mediaStorage";
import { scheduleS3UploadFromLocalPath } from "./s3Storage";

const execFileAsync = promisify(execFile);

const ALLOWED_HEIGHTS = new Set([1080, 720, 480, 360, 240, 144]);

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

/** Probe native height of a locally stored reels upload (null for external URLs). */
export async function probeVideoSourceHeight(
  uploadsRootDir: string,
  storedUrl: unknown,
): Promise<number | null> {
  const rel = uploadsRelPathFromStoredUrl(storedUrl);
  if (!rel) return null;
  const filePath = localPathForUploadsRel(rel, uploadsRootDir);
  if (!filePath || !fs.existsSync(filePath)) return null;

  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) return null;
  const ffprobe = ffmpeg.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
  if (!fs.existsSync(ffprobe) && ffprobe === ffmpeg) {
    try {
      const mod = await import("@ffmpeg-installer/ffmpeg");
      const pkgDir = path.dirname(
        (mod as { default?: { path?: string }; path?: string }).default?.path
          ?? (mod as { path?: string }).path
          ?? "",
      );
      const candidate = path.join(pkgDir, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
      if (fs.existsSync(candidate)) {
        return probeHeightWithFfprobe(candidate, filePath);
      }
    } catch { /* ignore */ }
    return null;
  }
  return probeHeightWithFfprobe(ffprobe, filePath);
}

async function probeHeightWithFfprobe(ffprobe: string, filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(ffprobe, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=height",
      "-of",
      "csv=p=0",
      filePath,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    const h = Math.round(Number(String(stdout).trim()));
    return h > 0 ? h : null;
  } catch {
    return null;
  }
}

export function parseMaxHeightQuery(raw: unknown): number | null {
  const n = Math.round(Number(raw));
  if (!ALLOWED_HEIGHTS.has(n)) return null;
  return n;
}

function variantRelPath(videoId: number, height: number): string {
  return `/uploads/reels/variants/${videoId}_${height}.mp4`;
}

/** Cached transcoded file for quality selection, or null to fall back to original. */
export async function resolveReelsQualityVideoPath(
  uploadsRootDir: string,
  storedUrl: unknown,
  videoId: number,
  maxHeight: number | null,
): Promise<string | null> {
  const rel = uploadsRelPathFromStoredUrl(storedUrl);
  if (!rel) return null;
  const sourcePath = localPathForUploadsRel(rel, uploadsRootDir);
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  if (!maxHeight) return sourcePath;

  const outRel = variantRelPath(videoId, maxHeight);
  const outPath = localPathForUploadsRel(outRel, uploadsRootDir);
  if (!outPath) return sourcePath;
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) return outPath;

  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) return sourcePath;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  try {
    await execFileAsync(ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      sourcePath,
      "-vf",
      `scale=-2:${maxHeight}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outPath,
    ], { timeout: 300_000, maxBuffer: 20 * 1024 * 1024 });
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
      scheduleS3UploadFromLocalPath(outPath, uploadsRootDir);
      return outPath;
    }
  } catch {
    /* fall back to source */
  }
  return sourcePath;
}

export function variantUploadsRel(videoId: number, height: number): string {
  return variantRelPath(videoId, height);
}

export function uploadsRelForLocalVideoPath(localPath: string, uploadsRootDir: string): string | null {
  return uploadsRelFromLocalPath(localPath, uploadsRootDir);
}
