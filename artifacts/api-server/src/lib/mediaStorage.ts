import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Request } from "express";

const mediaStorageDir = path.dirname(fileURLToPath(import.meta.url));
const defaultUploadsRoot = path.resolve(mediaStorageDir, "../../uploads");

/** Default api-server/uploads directory. */
export function defaultUploadsRootDir(): string {
  return defaultUploadsRoot;
}

/** Extract `/uploads/...` from stored URL (absolute, relative, or bare path). */
export function uploadsRelPathFromStoredUrl(url: unknown): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  const matched = raw.match(/\/uploads\/[^\s?#]+/);
  if (matched) return matched[0];
  if (raw.startsWith("uploads/")) return `/${raw.split(/[?#]/)[0]}`;
  return null;
}

/** True when media can be served from S3 / CloudFront / CDN base URL. */
export function cdnDeliveryConfigured(): boolean {
  if (process.env["S3_UPLOAD_ENABLED"] === "0") {
    return Boolean(process.env["MEDIA_PUBLIC_BASE_URL"]?.trim() || process.env["CDN_BASE_URL"]?.trim());
  }
  return Boolean(
    process.env["AWS_S3_BUCKET"]?.trim()
    || process.env["MEDIA_PUBLIC_BASE_URL"]?.trim()
    || process.env["CDN_BASE_URL"]?.trim(),
  );
}

/** API host for routes and local /uploads/ delivery (never the CDN host). */
export function apiHostBase(req: Request): string {
  const configured = (process.env["PUBLIC_API_DOMAIN"] || process.env["EXPO_PUBLIC_DOMAIN"] || "").trim();
  if (configured) {
    const base = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
    return base.replace(/\/+$/, "");
  }
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0];
  const host = req.get("host");
  if (host) return `${proto}://${host}`;
  return "https://videh.co.in";
}

/** CDN or API base URL for a relative path (e.g. `/uploads/reels/foo.jpg`). */
export function publicMediaUrl(req: Request, relPath: string): string {
  const rel = relPath.startsWith("/") ? relPath : `/${relPath}`;
  if (rel.startsWith("/api/")) {
    return `${apiHostBase(req)}${rel}`;
  }
  const cdnBase = (process.env["MEDIA_PUBLIC_BASE_URL"] || process.env["CDN_BASE_URL"] || "").replace(/\/+$/, "");
  if (cdnBase) return `${cdnBase}${rel}`;

  const configured = (process.env["PUBLIC_API_DOMAIN"] || process.env["EXPO_PUBLIC_DOMAIN"] || "").trim();
  if (configured) {
    const base = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
    return `${base.replace(/\/+$/, "")}${rel}`;
  }

  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol ?? "https").split(",")[0];
  const host = req.get("host");
  if (host) return `${proto}://${host}${rel}`;
  return `https://videh.co.in${rel}`;
}

/**
 * Resolve stored `/uploads/...` for JSON responses.
 * Serves via API/static host while the file is still on disk; CDN after local copy is removed.
 */
export function resolveStoredMediaUrl(
  req: Request,
  url: unknown,
  uploadsRootDir?: string,
): string | null {
  const raw = String(url ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) && !uploadsRelPathFromStoredUrl(raw)) return raw;

  const rel = uploadsRelPathFromStoredUrl(raw);
  if (!rel) {
    if (raw.startsWith("/api/")) return `${apiHostBase(req)}${raw}`;
    return publicMediaUrl(req, raw.startsWith("/") ? raw : `/${raw}`);
  }

  const root = uploadsRootDir ?? defaultUploadsRootDir();
  if (storedUploadFileExists(url, root)) {
    return `${apiHostBase(req)}${rel}`;
  }
  if (cdnDeliveryConfigured()) {
    return publicMediaUrl(req, rel);
  }
  return `${apiHostBase(req)}${rel}`;
}

/**
 * Resolve reels-style media: CDN when file is on S3 only, otherwise an API fallback route.
 */
export function resolveUploadsPublicUrl(
  req: Request,
  storedUrl: unknown,
  opts: {
    uploadsRootDir?: string;
    apiFallbackPath: string;
    cacheVersion?: unknown;
  },
): string {
  const raw = String(storedUrl ?? "").trim();
  const v = opts.cacheVersion != null ? encodeURIComponent(String(opts.cacheVersion)) : "";
  const q = v ? `?v=${v}` : "";
  const root = opts.uploadsRootDir ?? defaultUploadsRootDir();

  if (raw && /^https?:\/\//i.test(raw) && !uploadsRelPathFromStoredUrl(raw)) {
    return raw;
  }

  const rel = uploadsRelPathFromStoredUrl(raw);
  if (rel && cdnDeliveryConfigured() && !storedUploadFileExists(raw, root)) {
    return `${publicMediaUrl(req, rel)}${q}`;
  }

  const fallback = opts.apiFallbackPath.startsWith("/") ? opts.apiFallbackPath : `/${opts.apiFallbackPath}`;
  return `${apiHostBase(req)}${fallback}${q}`;
}

/** Resolve stored uploads without a live request (ads feed, background jobs). */
export function resolveStoredMediaUrlEnv(url: unknown, uploadsRootDir?: string): string | null {
  const fakeReq = { headers: {}, protocol: "https", get: () => undefined } as Request;
  return resolveStoredMediaUrl(fakeReq, url, uploadsRootDir);
}

/** Map `/uploads/reels/foo.mp4` to a local file under api-server/uploads (null if unsafe/missing). */
/** Inverse of localPathForUploadsRel — e.g. `.../uploads/reels/a.mp4` → `/uploads/reels/a.mp4`. */
export function uploadsRelFromLocalPath(localPath: string, uploadsRootDir: string): string | null {
  const root = path.resolve(uploadsRootDir);
  const full = path.resolve(localPath);
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  const suffix = full.slice(root.length).replace(/\\/g, "/");
  return `/uploads${suffix}`;
}

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

/** Detect JPEG/PNG/WebP from file header (works even when extension is wrong, e.g. .mp4). */
export function detectImageMimeType(filePath: string): string {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
    if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  } catch {
    /* fall through */
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}
