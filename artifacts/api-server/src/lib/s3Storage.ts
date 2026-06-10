import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { logger } from "./logger";
import {
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
  return Boolean(
    isS3MediaEnabled()
    || process.env["MEDIA_PUBLIC_BASE_URL"]?.trim()
    || process.env["CDN_BASE_URL"]?.trim(),
  );
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

export function uploadsRelToS3Key(uploadsRel: string): string {
  const rel = uploadsRelPathFromStoredUrl(uploadsRel) ?? uploadsRel;
  const prefix = (process.env["S3_KEY_PREFIX"] ?? "").replace(/^\/+|\/+$/g, "");
  const key = rel.replace(/^\//, "");
  return prefix ? `${prefix}/${key}` : key;
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
