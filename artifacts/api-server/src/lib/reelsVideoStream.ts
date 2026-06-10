import { createReadStream, existsSync, statSync } from "node:fs";
import type { Request, Response } from "express";
import {
  defaultUploadsRootDir,
  localPathForUploadsRel,
  resolveStoredMediaUrl,
  uploadsRelPathFromStoredUrl,
} from "./mediaStorage";

function videoMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  if (ext === "m4v") return "video/mp4";
  if (ext === "3gp") return "video/3gpp";
  return "video/mp4";
}

/** Stream a local video file with HTTP Range support (required for mobile players). */
export function serveLocalVideoWithRange(req: Request, res: Response, filePath: string): void {
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const mime = videoMimeType(filePath);
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0] ?? "0", 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (start >= fileSize || end >= fileSize) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mime,
      "Cache-Control": "public, max-age=3600",
    });
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Length": fileSize,
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  });
  createReadStream(filePath).pipe(res);
}

/** Stream a stored reels video URL (local upload) or return false if not on disk. */
export function tryStreamStoredReelsVideo(
  req: Request,
  res: Response,
  storedUrl: unknown,
  uploadsRootDir: string,
): boolean {
  const rel = uploadsRelPathFromStoredUrl(storedUrl);
  if (!rel) return false;
  const filePath = localPathForUploadsRel(rel, uploadsRootDir);
  if (!filePath || !existsSync(filePath)) return false;
  serveLocalVideoWithRange(req, res, filePath);
  return true;
}

export function externalVideoRedirectTarget(req: Request, storedUrl: unknown): string | null {
  const raw = String(storedUrl ?? "").trim();
  if (!raw || uploadsRelPathFromStoredUrl(raw)) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const resolved = resolveStoredMediaUrl(req, raw, defaultUploadsRootDir());
  return resolved && /^https?:\/\//i.test(resolved) ? resolved : null;
}
