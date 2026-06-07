import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "express";
import { query } from "../lib/db";
import {
  localPathForUploadsRel,
  resolveStoredMediaUrl,
  storedUploadFileExists,
  uploadsRelPathFromStoredUrl,
} from "../lib/mediaStorage";
import { externalVideoRedirectTarget, tryStreamStoredReelsVideo } from "../lib/reelsVideoStream";
import { logAdminAction } from "../lib/adminAudit";
import { getReelsPlatformConfig, saveReelsPlatformConfig, type ReelsPlatformConfig } from "../lib/reelsConfig";
import { runChannelFraudRescan } from "../lib/reelsFraud";
import { evaluateChannelMonetization } from "../lib/reelsMonetization";
import {
  adminHasCompletedVideoPreview,
  adminReviewerKey,
  applyVideoModerationResult,
  logAdminVideoPreview,
  requiredAdminPreviewSeconds,
} from "../lib/reelsContentModeration";
import type { AdminIdentity } from "../lib/adminSession";
import { processPendingReelsModeration } from "../lib/reelsModerationQueue";
import { notifySubscribersNewVideo } from "../lib/reelsNotifications";
import { ensureReelsModerationColumns, ensureReelsTables } from "../lib/reelsSchema";
import { ensureReelsAdsTables } from "../lib/reelsAdsSchema";
import { requireAnyPermission, requirePermission, type RequireAdmin } from "./admin-rbac";

const adminRoutesDir = path.dirname(fileURLToPath(import.meta.url));
const apiServerDir = path.resolve(adminRoutesDir, "../..");
const uploadsRootDir = path.join(apiServerDir, "uploads");

function mapModerationQueueRow(req: Parameters<typeof resolveStoredMediaUrl>[0], row: Record<string, unknown>) {
  const videoUrl = resolveStoredMediaUrl(req, row.video_url);
  const thumbnailUrl = resolveStoredMediaUrl(req, row.thumbnail_url);
  const hasLocalFile = storedUploadFileExists(row.video_url, uploadsRootDir);
  return {
    ...row,
    video_url: videoUrl,
    thumbnail_url: thumbnailUrl,
    preview_stream_url: `/api/admin/reels/videos/${row.id}/stream`,
    file_on_server: hasLocalFile,
  };
}

export function registerAdminReelsRoutes(router: Router, requireAdmin: RequireAdmin): void {
  router.get("/reels/config", requireAdmin, requirePermission("reels.read"), async (_req, res) => {
    try {
      const config = await getReelsPlatformConfig();
      res.json({ success: true, config });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to load reels config" });
    }
  });

  router.put("/reels/config", requireAdmin, requirePermission("reels.manage"), async (req, res) => {
    try {
      const body = req.body as Partial<ReelsPlatformConfig>;
      const adminEmail = (req as { adminEmail?: string }).adminEmail;
      const config = await saveReelsPlatformConfig(body, adminEmail);
      await logAdminAction({ action: "reels_config_update", entityType: "reels_config", entityId: 1 }, req);
      res.json({ success: true, config });
    } catch (err) {
      res.status(500).json({ success: false, message: "Failed to save reels config" });
    }
  });

  router.get("/reels/channels", requireAdmin, requirePermission("reels.read"), async (req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    try {
      await ensureReelsTables();
      const params: unknown[] = [limit];
      let where = "1=1";
      if (q) {
        where = "(LOWER(c.handle) LIKE $2 OR CAST(c.user_id AS TEXT) = $3 OR LOWER(COALESCE(u.name,'')) LIKE $2)";
        params.push(`%${q}%`, q);
      }
      const r = await query(
        `SELECT c.id, c.user_id, c.handle, c.avatar_url, c.subscriber_count, c.total_views,
                c.total_view_hours, c.total_likes, c.total_comments, c.total_shares,
                c.fraud_score, c.monetization_status, c.monetization_eligible, c.created_at,
                u.name AS owner_name, u.phone AS owner_phone,
                (SELECT COUNT(*)::int FROM reels_videos v WHERE v.channel_id = c.id) AS video_count
         FROM reels_channels c
         LEFT JOIN users u ON u.id = c.user_id
         WHERE ${where}
         ORDER BY c.total_views DESC
         LIMIT $1`,
        params,
      );
      res.json({ success: true, channels: r.rows });
    } catch (err) {
      res.status(500).json({ success: false, message: "Channels query failed" });
    }
  });

  router.get("/reels/stats", requireAdmin, requirePermission("reels.read"), async (_req, res) => {
    try {
      await ensureReelsTables();
      const r = await query(
        `SELECT
          (SELECT COUNT(*)::int FROM reels_channels) AS channels,
          (SELECT COUNT(*)::int FROM reels_videos) AS videos,
          (SELECT COUNT(*)::int FROM reels_subscriptions) AS subscriptions,
          (SELECT COALESCE(SUM(total_views), 0)::bigint FROM reels_channels) AS total_views,
          (SELECT COALESCE(SUM(total_view_hours), 0)::numeric FROM reels_channels) AS total_view_hours,
          (SELECT COUNT(*)::int FROM reels_fraud_events WHERE created_at > NOW() - INTERVAL '7 days') AS fraud_events_7d`,
      );
      res.json({ success: true, stats: r.rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: "Stats failed" });
    }
  });

  router.get("/reels/fraud-events", requireAdmin, requirePermission("reels.read"), async (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 80);
    try {
      const r = await query(
        `SELECT * FROM reels_fraud_events ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      res.json({ success: true, events: r.rows });
    } catch (err) {
      res.status(500).json({ success: false, message: "Fraud events failed" });
    }
  });

  router.post("/reels/fraud-scan", requireAdmin, requirePermission("reels.manage"), async (_req, res) => {
    try {
      const channels = await query(`SELECT id FROM reels_channels ORDER BY id`);
      let scanned = 0;
      for (const row of channels.rows) {
        await runChannelFraudRescan(Number(row.id));
        scanned += 1;
      }
      await logAdminAction({ action: "reels_fraud_scan", entityType: "reels_platform", entityId: 0, metadata: { scanned } }, _req);
      res.json({ success: true, scanned });
    } catch (err) {
      res.status(500).json({ success: false, message: "Fraud scan failed" });
    }
  });

  router.post("/reels/channels/:channelId/monetization-review", requireAdmin, requirePermission("reels.manage"), async (req, res) => {
    const channelId = Number(req.params.channelId);
    const { status } = req.body as { status?: string };
    const allowed = ["eligible", "not_eligible", "review", "suspended"];
    if (!allowed.includes(String(status))) {
      res.status(400).json({ success: false, message: "Invalid status" });
      return;
    }
    try {
      const eligible = status === "eligible";
      await query(
        `UPDATE reels_channels SET monetization_status = $1, monetization_eligible = $2 WHERE id = $3`,
        [status, eligible, channelId],
      );
      const check = await evaluateChannelMonetization(channelId);
      await logAdminAction({
        action: "reels_monetization_review",
        entityType: "reels_channel",
        entityId: channelId,
        metadata: { status, check },
      }, req);
      res.json({ success: true, monetization: check });
    } catch (err) {
      res.status(500).json({ success: false, message: "Review failed" });
    }
  });

  router.get("/reels/moderation-queue", requireAdmin, requireAnyPermission("reels.read", "moderation.read"), async (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const status = String(req.query.status ?? "pending").trim();
    try {
      await ensureReelsModerationColumns();
      let where = "v.moderation_status IN ('pending_scan') OR v.status = 'pending_review'";
      if (status === "rejected") where = "v.moderation_status = 'rejected' OR v.status = 'removed'";
      else if (status === "approved") where = "v.moderation_status = 'approved' AND v.status = 'published'";
      const r = await query(
        `SELECT v.id, v.title, v.description, v.duration_seconds, v.status, v.moderation_status,
                v.moderation_reason, v.nsfw_score, v.thumbnail_url, v.video_url, v.created_at,
                c.handle AS channel_handle, c.user_id
         FROM reels_videos v
         JOIN reels_channels c ON c.id = v.channel_id
         WHERE ${where}
         ORDER BY v.created_at DESC
         LIMIT $1`,
        [limit],
      );
      res.json({
        success: true,
        videos: r.rows.map((row) => mapModerationQueueRow(req, row as Record<string, unknown>)),
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Moderation queue failed" });
    }
  });

  router.get("/reels/videos/:videoId/stream", requireAdmin, requireAnyPermission("reels.read", "moderation.read"), async (req, res) => {
    const videoId = Number(req.params.videoId);
    try {
      const r = await query(`SELECT video_url FROM reels_videos WHERE id = $1`, [videoId]);
      if (!r.rows.length) {
        res.status(404).json({ success: false, message: "Video not found" });
        return;
      }
      const storedUrl = r.rows[0].video_url;
      if (tryStreamStoredReelsVideo(req, res, storedUrl, uploadsRootDir)) return;
      const rel = uploadsRelPathFromStoredUrl(storedUrl);
      if (rel) {
        res.status(404).json({
          success: false,
          message: "Video file server par nahi mili — ho sakta hai server restart ke baad upload delete ho gaya. User se dubara upload karwayein.",
        });
        return;
      }
      const external = externalVideoRedirectTarget(req, storedUrl);
      if (external) {
        res.redirect(external);
        return;
      }
      res.status(404).json({ success: false, message: "Video URL invalid" });
    } catch (err) {
      res.status(500).json({ success: false, message: "Stream failed" });
    }
  });

  router.post("/reels/moderation-scan", requireAdmin, requireAnyPermission("reels.manage", "moderation.manage"), async (_req, res) => {
    try {
      const processed = await processPendingReelsModeration(25);
      await logAdminAction({ action: "reels_moderation_scan", entityType: "reels_platform", entityId: 0, metadata: { processed } }, _req);
      res.json({ success: true, processed });
    } catch (err) {
      res.status(500).json({ success: false, message: "Moderation scan failed" });
    }
  });

  router.post("/reels/videos/:videoId/admin-preview", requireAdmin, requireAnyPermission("reels.manage", "moderation.manage"), async (req, res) => {
    const videoId = Number(req.params.videoId);
    const watchedSeconds = Number((req.body as { watchedSeconds?: number }).watchedSeconds) || 0;
    const admin = req.admin as AdminIdentity;
    try {
      const meta = await query(
        `SELECT duration_seconds FROM reels_videos WHERE id = $1`,
        [videoId],
      );
      if (!meta.rows.length) {
        res.status(404).json({ success: false, message: "Video not found" });
        return;
      }
      const durationSeconds = Number(meta.rows[0].duration_seconds ?? 0);
      const required = requiredAdminPreviewSeconds(durationSeconds);
      if (watchedSeconds < required) {
        res.status(400).json({
          success: false,
          message: `Pehle kam se kam ${required} second video dekhein, phir approve karein.`,
          requiredSeconds: required,
        });
        return;
      }
      const adminKey = adminReviewerKey(admin.adminId, admin.email);
      await logAdminVideoPreview(videoId, adminKey, watchedSeconds, required);
      await logAdminAction({
        action: "reels_video_admin_preview",
        entityType: "reels_video",
        entityId: videoId,
        metadata: { watchedSeconds, requiredSeconds: required },
      }, req);
      res.json({ success: true, requiredSeconds: required });
    } catch (err) {
      res.status(500).json({ success: false, message: "Preview log failed" });
    }
  });

  router.post("/reels/videos/:videoId/approve", requireAdmin, requireAnyPermission("reels.manage", "moderation.manage"), async (req, res) => {
    const videoId = Number(req.params.videoId);
    const admin = req.admin as AdminIdentity;
    try {
      const meta = await query(
        `SELECT v.title, v.channel_id, v.duration_seconds, c.handle FROM reels_videos v
         JOIN reels_channels c ON c.id = v.channel_id WHERE v.id = $1`,
        [videoId],
      );
      if (!meta.rows.length) {
        res.status(404).json({ success: false, message: "Video not found" });
        return;
      }
      const durationSeconds = Number(meta.rows[0].duration_seconds ?? 0);
      const required = requiredAdminPreviewSeconds(durationSeconds);
      const adminKey = adminReviewerKey(admin.adminId, admin.email);
      const previewed = await adminHasCompletedVideoPreview(videoId, adminKey, required);
      if (!previewed) {
        res.status(400).json({
          success: false,
          message: "Pehle video play karke dekhein (Preview), phir approve karein.",
          requiredSeconds: required,
        });
        return;
      }
      await applyVideoModerationResult(videoId, { action: "approve", nsfwScore: 0, details: { manual: true, adminKey } });
      const row = meta.rows[0];
      void notifySubscribersNewVideo(Number(row.channel_id), videoId, String(row.title), String(row.handle));
      await logAdminAction({ action: "reels_video_approve", entityType: "reels_video", entityId: videoId }, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: "Approve failed" });
    }
  });

  router.post("/reels/videos/:videoId/reject", requireAdmin, requireAnyPermission("reels.manage", "moderation.manage"), async (req, res) => {
    const videoId = Number(req.params.videoId);
    const { reason } = req.body as { reason?: string };
    try {
      await applyVideoModerationResult(videoId, {
        action: "reject",
        reason: reason?.trim() || "Blocked by admin: policy violation",
        nsfwScore: 1,
        details: { manual: true },
      });
      await logAdminAction({ action: "reels_video_reject", entityType: "reels_video", entityId: videoId, metadata: { reason } }, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: "Reject failed" });
    }
  });

  router.get("/reels/ads/review-queue", requireAdmin, requireAnyPermission("reels.read", "moderation.read"), async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    try {
      await ensureReelsAdsTables();
      const r = await query(
        `SELECT cr.id, cr.title, cr.format, cr.placement, cr.headline, cr.description,
                cr.image_url, cr.video_url, cr.cta_type, cr.destination_url,
                cr.play_store_url, cr.app_store_url, cr.app_name, cr.ad_type,
                cr.moderation_status, cr.moderation_reason, cr.created_at,
                camp.name AS campaign_name, adv.company_name, adv.email AS advertiser_email
         FROM reels_ad_creatives cr
         JOIN reels_ad_campaigns camp ON camp.id = cr.campaign_id
         JOIN reels_advertisers adv ON adv.id = camp.advertiser_id
         WHERE cr.moderation_status = 'pending_review'
         ORDER BY cr.created_at ASC
         LIMIT $1`,
        [limit],
      );
      const creatives = r.rows.map((row) => {
        const rec = row as Record<string, unknown>;
        return {
          ...rec,
          image_url: rec.image_url ? resolveStoredMediaUrl(req, rec.image_url) : null,
          video_url: rec.video_url ? resolveStoredMediaUrl(req, rec.video_url) : null,
        };
      });
      res.json({ success: true, creatives });
    } catch {
      res.status(500).json({ success: false, message: "Failed to load ad review queue" });
    }
  });

  router.post("/reels/ads/:creativeId/approve", requireAdmin, requireAnyPermission("reels.manage", "moderation.manage"), async (req, res) => {
    const creativeId = Number(req.params.creativeId);
    const admin = req.admin as AdminIdentity;
    try {
      await ensureReelsAdsTables();
      const r = await query(
        `UPDATE reels_ad_creatives
         SET moderation_status = 'approved', moderation_reason = NULL,
             reviewed_at = NOW(), reviewed_by = $2
         WHERE id = $1 AND moderation_status = 'pending_review'
         RETURNING id, title`,
        [creativeId, admin.email || `admin_${admin.adminId}`],
      );
      if (!r.rows.length) {
        res.status(404).json({ success: false, message: "Ad not found or already reviewed" });
        return;
      }
      await logAdminAction({ action: "reels_ad_approve", entityType: "reels_ad_creative", entityId: creativeId }, req);
      res.json({ success: true, creative: r.rows[0] });
    } catch {
      res.status(500).json({ success: false, message: "Approve failed" });
    }
  });

  router.post("/reels/ads/:creativeId/reject", requireAdmin, requireAnyPermission("reels.manage", "moderation.manage"), async (req, res) => {
    const creativeId = Number(req.params.creativeId);
    const admin = req.admin as AdminIdentity;
    const reason = String((req.body as { reason?: string }).reason ?? "").trim()
      || "Rejected by Videh admin — policy violation";
    try {
      await ensureReelsAdsTables();
      const r = await query(
        `UPDATE reels_ad_creatives
         SET moderation_status = 'rejected', moderation_reason = $3, is_active = FALSE,
             reviewed_at = NOW(), reviewed_by = $2
         WHERE id = $1 AND moderation_status IN ('pending_review', 'approved')
         RETURNING id, title`,
        [creativeId, admin.email || `admin_${admin.adminId}`, reason],
      );
      if (!r.rows.length) {
        res.status(404).json({ success: false, message: "Ad not found" });
        return;
      }
      await logAdminAction({
        action: "reels_ad_reject",
        entityType: "reels_ad_creative",
        entityId: creativeId,
        metadata: { reason },
      }, req);
      res.json({ success: true, creative: r.rows[0] });
    } catch {
      res.status(500).json({ success: false, message: "Reject failed" });
    }
  });

  router.patch("/reels/videos/:videoId", requireAdmin, requirePermission("reels.manage"), async (req, res) => {
    const videoId = Number(req.params.videoId);
    const { status, playEnabled } = req.body as { status?: string; playEnabled?: boolean };
    try {
      if (status) {
        await query(`UPDATE reels_videos SET status = $1 WHERE id = $2`, [status, videoId]);
      }
      if (typeof playEnabled === "boolean") {
        await query(`UPDATE reels_videos SET play_enabled = $1 WHERE id = $2`, [playEnabled, videoId]);
      }
      await logAdminAction({ action: "reels_video_moderate", entityType: "reels_video", entityId: videoId, metadata: { status, playEnabled } }, req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: "Update failed" });
    }
  });
}
