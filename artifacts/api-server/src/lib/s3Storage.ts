import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { logger } from "./logger";
import {
  cdnDeliveryConfigured,
  publicMediaUrl,
  storedUploadFileExists,
  uploadsRelFromLocalPath,
  uploadsRelPathFromStoredUrl,
} from "./mediaStorage";

function s3Bucket(): string {
  return process.env["AWS_S3_BUCKET"]?.trim() ?? "";
}

function s3Region(): string {
  return (
    process.env["AWS_REGION"]?.trim()
    || process.env["AWS_DEFAULT_REGION"]?.trim()
    || "ap-south-1"
  );
}

/** True when media can be served from S3 / CloudFront / CDN base URL. */
export function cdnDeliveryEnabled(): boolean {
  return cdnDeliveryConfigured();
}

/** Local disk or CDN/S3 — used by admin moderation preview. */
export function storedMediaIsPlayable(storedUrl: unknown, uploadsRootDir: string): boolean {
  if (storedUploadFileExists(storedUrl, uploadsRootDir)) return true;
  const rel = uploadsRelPathFromStoredUrl(storedUrl);
  if (rel && cdnDeliveryEnabled()) return true;
  return /^https?:\/\//i.test(String(storedUrl ?? "").trim());
}

/** True when AWS_S3_BUCKET is set and uploads are not explicitly disabled. */
export function isS3MediaEnabled(): boolean {
  if (process.env["S3_UPLOAD_ENABLED"] === "0") return false;
  return Boolean(s3Bucket());
}

/** Client PUT straight to S3 (skips EC2 disk for large reels uploads). */
export function isS3DirectUploadEnabled(): boolean {
  if (process.env["S3_DIRECT_UPLOAD"] === "0") return false;
  return isS3MediaEnabled();
}

export function mimeFromContentType(contentType: string, fallback = "application/octet-stream"): string {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return mime || fallback;
}

export function extFromContentType(contentType: string, fallbackExt: string): string {
  const mime = mimeFromContentType(contentType);
  if (mime.includes("quicktime")) return ".mov";
  if (mime.includes("webm")) return ".webm";
  if (mime.includes("3gpp")) return ".3gp";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("mp4")) return ".mp4";
  return fallbackExt;
}

export function uploadsRelToS3Key(uploadsRel: string): string {
  const rel = uploadsRelPathFromStoredUrl(uploadsRel) ?? uploadsRel;
  const prefix = (process.env["S3_KEY_PREFIX"] ?? "").replace(/^\/+|\/+$/g, "");
  const key = rel.replace(/^\//, "");
  return prefix ? `${prefix}/${key}` : key;
}

/** Candidate S3 keys — handles legacy paths and optional prefix. */
export function candidateS3KeysForStoredUrl(storedUrl: unknown): string[] {
  const rel = uploadsRelPathFromStoredUrl(storedUrl);
  if (!rel) return [];
  const keys = new Set<string>();
  keys.add(uploadsRelToS3Key(rel));
  const bare = rel.replace(/^\//, "");
  keys.add(bare);
  const underReels = bare.replace(/^uploads\//, "");
  if (underReels !== bare) keys.add(underReels);
  const prefix = (process.env["S3_KEY_PREFIX"] ?? "").replace(/^\/+|\/+$/g, "");
  if (prefix) {
    keys.add(`${prefix}/${bare}`);
    if (underReels !== bare) keys.add(`${prefix}/${underReels}`);
  }
  return [...keys];
}

async function headS3ObjectByKey(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    const out = await client.send(new HeadObjectCommand({ Bucket: s3Bucket(), Key: key }));
    const size = Number(out.ContentLength ?? 0);
    if (!Number.isFinite(size) || size <= 0) return null;
    return { size, contentType: out.ContentType };
  } catch {
    return null;
  }
}

export async function resolveExistingS3Key(storedUrl: unknown): Promise<string | null> {
  if (!isS3MediaEnabled()) return null;
  for (const key of candidateS3KeysForStoredUrl(storedUrl)) {
    const head = await headS3ObjectByKey(key);
    if (head) return key;
  }
  return null;
}

export async function fetchS3ObjectBytes(
  storedUrl: unknown,
): Promise<{ body: Buffer; contentType: string; key: string } | null> {
  if (!isS3MediaEnabled()) return null;
  const key = await resolveExistingS3Key(storedUrl);
  if (!key) return null;
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    const out = await client.send(new GetObjectCommand({ Bucket: s3Bucket(), Key: key }));
    if (!out.Body) return null;
    const body = Buffer.from(await out.Body.transformToByteArray());
    return {
      body,
      contentType: out.ContentType || mimeForFile(key),
      key,
    };
  } catch (err) {
    logger.warn({ err, key }, "S3 GetObject failed");
    return null;
  }
}

export async function getPresignedDownloadUrl(storedUrl: unknown, expiresIn = 3600): Promise<string | null> {
  if (!isS3MediaEnabled()) return null;
  const key = await resolveExistingS3Key(storedUrl);
  if (!key) return null;
  try {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await s3Client();
    return await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: s3Bucket(), Key: key }),
      { expiresIn },
    );
  } catch (err) {
    logger.warn({ err, key }, "S3 presigned download failed");
    return null;
  }
}

/** Download S3 object to a local temp path (for ffmpeg thumbnail extraction). */
export async function downloadS3ObjectToFile(storedUrl: unknown, destPath: string): Promise<boolean> {
  const fetched = await fetchS3ObjectBytes(storedUrl);
  if (!fetched) return false;
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, fetched.body);
    return fs.existsSync(destPath) && fs.statSync(destPath).size > 0;
  } catch (err) {
    logger.warn({ err, destPath }, "S3 download to file failed");
    return false;
  }
}

function mimeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".3gp") return "video/3gpp";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function cacheControlForKey(key: string): string {
  if (/\.(mp4|webm|mov|m4v|3gp)$/i.test(key)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=86400";
}

async function s3Client() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({ region: s3Region() });
}

/** Upload a local file to S3 using the `/uploads/...` path stored in the database. */
export async function uploadLocalFileToS3(localPath: string, uploadsRel: string): Promise<boolean> {
  if (!isS3MediaEnabled()) return false;
  const rel = uploadsRelPathFromStoredUrl(uploadsRel);
  if (!rel || !fs.existsSync(localPath)) return false;

  const key = uploadsRelToS3Key(rel);
  try {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: s3Bucket(),
        Key: key,
        Body: fs.createReadStream(localPath),
        ContentType: mimeForFile(localPath),
        CacheControl: cacheControlForKey(key),
      }),
    );
    logger.info({ key, bytes: fs.statSync(localPath).size }, "S3 upload complete");

    if (process.env["S3_DELETE_LOCAL_AFTER_UPLOAD"] === "1") {
      try {
        fs.unlinkSync(localPath);
      } catch {
        /* keep local copy if delete fails */
      }
    }
    return true;
  } catch (err) {
    logger.error({ err, key }, "S3 upload failed");
    return false;
  }
}

export function scheduleS3Upload(localPath: string, uploadsRel: string): void {
  if (!isS3MediaEnabled()) return;
  void uploadLocalFileToS3(localPath, uploadsRel);
}

/** Upload one or more local files to S3 and wait for completion. */
export async function uploadStoredMediaBatch(
  items: Array<{ localPath: string; uploadsRel: string }>,
): Promise<void> {
  if (!items.length || !isS3MediaEnabled()) return;
  await Promise.all(items.map((item) => uploadLocalFileToS3(item.localPath, item.uploadsRel)));
}

export async function deleteS3ObjectByUploadsRel(uploadsRel: unknown): Promise<void> {
  if (!isS3MediaEnabled()) return;
  const rel = uploadsRelPathFromStoredUrl(uploadsRel);
  if (!rel) return;
  const key = uploadsRelToS3Key(rel);
  try {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    await client.send(new DeleteObjectCommand({ Bucket: s3Bucket(), Key: key }));
  } catch (err) {
    logger.warn({ err, key }, "S3 delete failed");
  }
}

export async function pingS3Bucket(): Promise<boolean> {
  if (!isS3MediaEnabled()) return false;
  try {
    const { HeadBucketCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client();
    await client.send(new HeadBucketCommand({ Bucket: s3Bucket() }));
    return true;
  } catch {
    return false;
  }
}

/** Serve image from S3 via API buffer or presigned redirect (CloudFront is private). */
export async function serveStoredImageFromS3(res: Response, storedUrl: unknown): Promise<boolean> {
  const fetched = await fetchS3ObjectBytes(storedUrl);
  if (fetched) {
    res.setHeader("Content-Type", fetched.contentType);
    res.setHeader("Cache-Control", cacheControlForKey(fetched.key));
    res.send(fetched.body);
    return true;
  }
  const signed = await getPresignedDownloadUrl(storedUrl);
  if (signed) {
    res.redirect(302, signed);
    return true;
  }
  return false;
}

/** Redirect to CloudFront/CDN when media is on S3 (or CDN base is configured). */
export function tryRedirectStoredMediaToCdn(req: Request, res: Response, storedUrl: unknown): boolean {
  const rel = uploadsRelPathFromStoredUrl(storedUrl);
  if (!rel) return false;

  const cdnBase = (process.env["MEDIA_PUBLIC_BASE_URL"] || process.env["CDN_BASE_URL"] || "").trim();
  if (!cdnBase && !isS3MediaEnabled()) return false;

  const target = publicMediaUrl(req, rel);
  if (!/^https?:\/\//i.test(target)) return false;
  res.redirect(302, target);
  return true;
}

/** After writing a file under uploadsRoot, upload to S3 when enabled. */
export function scheduleS3UploadFromLocalPath(localPath: string, uploadsRootDir: string): void {
  const rel = uploadsRelFromLocalPath(localPath, uploadsRootDir);
  if (rel) scheduleS3Upload(localPath, rel);
}

export type PresignedUploadSlot = {
  uploadsRel: string;
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
  expiresInSeconds: number;
};

/** Presigned PUT URL for browser/app direct upload to S3. */
export async function createPresignedUploadUrl(
  req: Request,
  uploadsRel: string,
  contentType: string,
  expiresInSeconds = 3600,
): Promise<PresignedUploadSlot | null> {
  if (!isS3MediaEnabled()) return null;
  const rel = uploadsRelPathFromStoredUrl(uploadsRel);
  if (!rel || !rel.startsWith("/uploads/")) return null;

  const key = uploadsRelToS3Key(rel);
  const mime = mimeFromContentType(contentType);
  try {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await s3Client();
    const command = new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      ContentType: mime,
      CacheControl: cacheControlForKey(key),
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    const publicUrl = publicMediaUrl(req, rel);
    return {
      uploadsRel: rel,
      uploadUrl,
      publicUrl,
      contentType: mime,
      expiresInSeconds,
    };
  } catch (err) {
    logger.error({ err, key }, "presigned upload URL failed");
    return null;
  }
}

export async function headS3ObjectByUploadsRel(uploadsRel: string): Promise<{ size: number; contentType?: string } | null> {
  if (!isS3MediaEnabled()) return null;
  const key = await resolveExistingS3Key(uploadsRel);
  if (!key) return null;
  return headS3ObjectByKey(key);
}
