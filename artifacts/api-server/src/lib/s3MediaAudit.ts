import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import { query } from "./db";
import { logger } from "./logger";
import { uploadsRelPathFromStoredUrl } from "./mediaStorage";

let tableReady: Promise<void> | null = null;

export type S3UploadAuditMeta = {
  sourceApp?: string;
  sourceContext?: string;
  uploadMethod?: "server_proxy" | "direct_presigned";
  uploaderType?: "user" | "advertiser" | "admin" | "system";
  uploaderUserId?: number | string | null;
  uploaderAdvertiserId?: number | null;
  uploaderEmail?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  originalFilename?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  cdnUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export async function ensureS3MediaUploadsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = query(`
      CREATE TABLE IF NOT EXISTS s3_media_uploads (
        id BIGSERIAL PRIMARY KEY,
        stored_url TEXT NOT NULL,
        s3_bucket TEXT,
        s3_key TEXT NOT NULL,
        cdn_url TEXT,
        media_type TEXT NOT NULL DEFAULT 'other',
        mime_type TEXT,
        size_bytes BIGINT NOT NULL DEFAULT 0,
        original_filename TEXT,
        source_app TEXT NOT NULL,
        source_context TEXT,
        upload_method TEXT NOT NULL DEFAULT 'server_proxy',
        uploader_type TEXT NOT NULL DEFAULT 'system',
        uploader_user_id TEXT,
        uploader_advertiser_id INTEGER,
        uploader_email TEXT,
        entity_type TEXT,
        entity_id BIGINT,
        ip_address INET,
        user_agent TEXT,
        upload_status TEXT NOT NULL DEFAULT 'completed',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_created_at ON s3_media_uploads (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_user ON s3_media_uploads (uploader_user_id) WHERE uploader_user_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_advertiser ON s3_media_uploads (uploader_advertiser_id) WHERE uploader_advertiser_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_stored_url ON s3_media_uploads (stored_url);
      CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_s3_key ON s3_media_uploads (s3_key);
      CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_source_app ON s3_media_uploads (source_app, created_at DESC);
    `).then(() => undefined).catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
}

function inferSourceFromRel(rel: string): { sourceApp: string; sourceContext: string } {
  const lower = rel.toLowerCase();
  if (lower.includes("/reels/ads/")) return { sourceApp: "ads_portal", sourceContext: "ad_creative" };
  if (lower.includes("/reels/variants/")) return { sourceApp: "reels", sourceContext: "video_variant" };
  if (lower.includes("/reels/")) return { sourceApp: "reels", sourceContext: "channel_or_video" };
  if (lower.includes("/chats/")) return { sourceApp: "chat", sourceContext: "message_attachment" };
  if (lower.includes("/status")) return { sourceApp: "status", sourceContext: "story_media" };
  if (lower.includes("/developer")) return { sourceApp: "developer", sourceContext: "portal_asset" };
  return { sourceApp: "videh", sourceContext: "general_upload" };
}

function mediaTypeFromMime(mime: string, filePath?: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  const ext = path.extname(filePath ?? "").toLowerCase();
  if ([".mp4", ".webm", ".mov", ".m4v", ".3gp"].includes(ext)) return "video";
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) return "image";
  return "other";
}

function isS3Enabled(): boolean {
  if (process.env["S3_UPLOAD_ENABLED"] === "0") return false;
  return Boolean(process.env["AWS_S3_BUCKET"]?.trim());
}

function uploadsRelToS3Key(uploadsRel: string): string {
  const rel = uploadsRelPathFromStoredUrl(uploadsRel) ?? uploadsRel;
  const prefix = (process.env["S3_KEY_PREFIX"] ?? "").replace(/^\/+|\/+$/g, "");
  const key = rel.replace(/^\//, "");
  return prefix ? `${prefix}/${key}` : key;
}

function s3BucketName(): string | null {
  const b = process.env["AWS_S3_BUCKET"]?.trim();
  return b || null;
}

function guessMimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

/** Build audit fields from an HTTP request (IP, user agent). */
export function auditFromRequest(req: Request, extra?: S3UploadAuditMeta): S3UploadAuditMeta {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  const ip = forwarded || String(req.socket?.remoteAddress ?? "");
  return {
    ipAddress: ip || null,
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 500) || null,
    ...extra,
  };
}

/** Record a successful S3 upload (non-blocking). */
export function recordS3MediaUpload(
  uploadsRel: string,
  opts: {
    localPath?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    audit?: S3UploadAuditMeta;
  } = {},
): void {
  if (!isS3Enabled()) return;
  const rel = uploadsRelPathFromStoredUrl(uploadsRel);
  if (!rel) return;

  void (async () => {
    try {
      await ensureS3MediaUploadsTable();
      const inferred = inferSourceFromRel(rel);
      const audit = opts.audit ?? {};
      const mime = opts.mimeType
        ?? (opts.localPath ? guessMimeFromPath(opts.localPath) : "application/octet-stream");
      let size = opts.sizeBytes ?? 0;
      if ((!size || size <= 0) && opts.localPath && fs.existsSync(opts.localPath)) {
        size = fs.statSync(opts.localPath).size;
      }

      const key = uploadsRelToS3Key(rel);
      const originalFilename = audit.originalFilename
        ?? (opts.localPath ? path.basename(opts.localPath) : path.basename(rel));

      await query(
        `INSERT INTO s3_media_uploads (
           stored_url, s3_bucket, s3_key, cdn_url, media_type, mime_type, size_bytes,
           original_filename, source_app, source_context, upload_method,
           uploader_type, uploader_user_id, uploader_advertiser_id, uploader_email,
           entity_type, entity_id, ip_address, user_agent, metadata
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16, $17, NULLIF($18, '')::inet, $19, $20::jsonb
         )`,
        [
          rel,
          s3BucketName(),
          key,
          audit.cdnUrl ?? null,
          mediaTypeFromMime(mime, opts.localPath ?? rel),
          mime,
          size,
          originalFilename,
          audit.sourceApp ?? inferred.sourceApp,
          audit.sourceContext ?? inferred.sourceContext,
          audit.uploadMethod ?? "server_proxy",
          audit.uploaderType ?? "system",
          audit.uploaderUserId != null ? String(audit.uploaderUserId) : null,
          audit.uploaderAdvertiserId ?? null,
          audit.uploaderEmail ?? null,
          audit.entityType ?? null,
          audit.entityId ?? null,
          audit.ipAddress ?? null,
          audit.userAgent ?? null,
          JSON.stringify(audit.metadata ?? {}),
        ],
      );
    } catch (err) {
      logger.warn({ err, uploadsRel }, "s3_media_uploads audit insert failed");
    }
  })();
}

/** After client direct-upload to S3 (presigned PUT), record from HEAD metadata. */
export function recordDirectS3Upload(
  uploadsRel: string,
  head: { size: number; contentType?: string },
  audit?: S3UploadAuditMeta,
): void {
  recordS3MediaUpload(uploadsRel, {
    mimeType: head.contentType ?? null,
    sizeBytes: head.size,
    audit: { ...audit, uploadMethod: "direct_presigned" },
  });
}

/** Attach entity id after parent row is created (e.g. reels_video id). */
export async function linkS3UploadEntity(
  storedUrl: string,
  entityType: string,
  entityId: number,
): Promise<void> {
  const rel = uploadsRelPathFromStoredUrl(storedUrl);
  if (!rel) return;
  try {
    await ensureS3MediaUploadsTable();
    await query(
      `UPDATE s3_media_uploads
       SET entity_type = $2, entity_id = $3
       WHERE stored_url = $1
         AND id = (
           SELECT id FROM s3_media_uploads WHERE stored_url = $1 ORDER BY created_at DESC LIMIT 1
         )`,
      [rel, entityType, entityId],
    );
  } catch (err) {
    logger.warn({ err, storedUrl, entityType, entityId }, "s3_media_uploads entity link failed");
  }
}
