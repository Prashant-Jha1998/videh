import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";

/** Extract `/uploads/...` from stored URL (absolute, relative, or bare path). */
export function uploadsRelPathFromStoredUrl(url: unknown): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  const matched = raw.match(/\/uploads\/[^\s?#]+/);
  if (matched) return matched[0];
  if (raw.startsWith("uploads/")) return `/${raw.split(/[?#]/)[0]}`;
  return null;
}

/** Resolve any stored media URL to a browser-loadable absolute URL on this API host. */
export function resolveStoredMediaUrl(req: Request, url: unknown): string | null {
  const rel = uploadsRelPathFromStoredUrl(url);
  if (rel) return publicMediaUrl(req, rel);
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return publicMediaUrl(req, raw.startsWith("/") ? raw : `/${raw}`);
}

/** Map `/uploads/reels/foo.mp4` to a local file under api-server/uploads (null if unsafe/missing). */
export function localPathForUploadsRel(relPath: string, uploadsRootDir: string): string | null {
  const rel = uploadsRelPathFromStoredUrl(relPath) ?? relPath;
  if (!rel.startsWith("/uploads/")) return null;
  const underUploads = rel.slice("/uploads/".length);
  const full = path.resolve(uploadsRootDir, underUploads);
  const root = path.resolve(uploadsRootDir);
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  return full;
}

export function storedUploadFileExists(url: unknown, uploadsRootDir: string): boolean {
  const local = localPathForUploadsRel(String(url ?? ""), uploadsRootDir);
  return Boolean(local && fs.existsSync(local));
}

export function publicMediaUrl(req: Request, relPath: string): string {
  const cdnBase = (process.env["MEDIA_PUBLIC_BASE_URL"] || process.env["CDN_BASE_URL"] || "").replace(/\/+$/, "");
  if (cdnBase) return `${cdnBase}${relPath}`;

  const configured = (process.env["PUBLIC_API_DOMAIN"] || process.env["EXPO_PUBLIC_DOMAIN"] || "").trim();
  if (configured) {
    const base = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
    return `${base.replace(/\/+$/, "")}${relPath}`;
  }

  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0];
  const host = req.get("host");
  if (host) return `${proto}://${host}${relPath}`;
  return `https://videh.co.in${relPath}`;
}
