import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { query } from "../lib/db";
import {
  adsPortalSessionConfigured,
  getAdsPortalUser,
  issueAdsPortalToken,
  setAdsPortalCookie,
} from "../lib/adsPortalSession";
import { ensureReelsAdsTables } from "../lib/reelsAdsSchema";
import { hashAdsPassword, verifyAdsAdvertiser } from "../lib/reelsAds";

const router = Router();
const adsUploadsDir = path.join(process.cwd(), "uploads", "reels", "ads");
fs.mkdirSync(adsUploadsDir, { recursive: true });

const adUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, adsUploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "") || ".mp4";
      cb(null, `ad_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

function requireAdsUser(req: Request, res: Response) {
  const user = getAdsPortalUser(req);
  if (!user) {
    res.status(401).json({ success: false, message: "Sign in required" });
    return null;
  }
  return user;
}

router.get("/me", async (req, res) => {
  const user = getAdsPortalUser(req);
  if (!user) {
    res.status(401).json({ success: false });
    return;
  }
  try {
    await ensureReelsAdsTables();
    const r = await query(
      `SELECT id, email, company_name, status, balance_inr FROM reels_advertisers WHERE id = $1`,
      [user.advertiserId],
    );
    const row = r.rows[0];
    if (!row) {
      res.status(404).json({ success: false });
      return;
    }
    res.json({ success: true, advertiser: row });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.post("/register", async (req, res) => {
  if (!adsPortalSessionConfigured()) {
    res.status(503).json({ success: false, message: "Ads portal not configured (set SESSION_SECRET)." });
    return;
  }
  const body = req.body as { email?: string; password?: string; companyName?: string; contactName?: string };
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const companyName = String(body.companyName ?? "").trim();
  if (!email || !password || password.length < 8 || !companyName) {
    res.status(400).json({ success: false, message: "Email, company name, and password (8+ chars) required" });
    return;
  }
  try {
    await ensureReelsAdsTables();
    const ins = await query(
      `INSERT INTO reels_advertisers (email, password_hash, company_name, contact_name, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING id, email, company_name`,
      [email, hashAdsPassword(password), companyName, body.contactName?.trim() || null],
    );
    const row = ins.rows[0] as { id: number; email: string; company_name: string };
    const token = issueAdsPortalToken({
      advertiserId: row.id,
      email: row.email,
      companyName: row.company_name,
    });
    setAdsPortalCookie(res, token);
    res.json({ success: true, token, advertiser: row });
  } catch (err: unknown) {
    const msg = String((err as { code?: string })?.code) === "23505" ? "Email already registered" : "Registration failed";
    res.status(400).json({ success: false, message: msg });
  }
});

router.post("/login", async (req, res) => {
  const body = req.body as { email?: string; password?: string };
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const row = await verifyAdsAdvertiser(email, password);
  if (!row) {
    res.status(401).json({ success: false, message: "Invalid email or password" });
    return;
  }
  const token = issueAdsPortalToken({
    advertiserId: row.id,
    email: row.email,
    companyName: row.company_name,
  });
  setAdsPortalCookie(res, token);
  res.json({
    success: true,
    token,
    advertiser: { id: row.id, email: row.email, company_name: row.company_name, balance_inr: row.balance_inr },
  });
});

router.get("/campaigns", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  try {
    await ensureReelsAdsTables();
    const r = await query(
      `SELECT id, name, status, daily_budget_inr, total_budget_inr, spent_inr, created_at
       FROM reels_ad_campaigns WHERE advertiser_id = $1 ORDER BY created_at DESC`,
      [user.advertiserId],
    );
    res.json({ success: true, campaigns: r.rows });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.post("/campaigns", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  const body = req.body as { name?: string; dailyBudgetInr?: number; totalBudgetInr?: number };
  const name = String(body.name ?? "").trim();
  if (!name) {
    res.status(400).json({ success: false, message: "Campaign name required" });
    return;
  }
  try {
    await ensureReelsAdsTables();
    const r = await query(
      `INSERT INTO reels_ad_campaigns (advertiser_id, name, daily_budget_inr, total_budget_inr)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        user.advertiserId,
        name,
        Math.max(100, Number(body.dailyBudgetInr) || 500),
        Math.max(500, Number(body.totalBudgetInr) || 5000),
      ],
    );
    res.json({ success: true, campaign: r.rows[0] });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.get("/campaigns/:campaignId/creatives", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  const campaignId = Number(req.params.campaignId);
  try {
    const r = await query(
      `SELECT cr.* FROM reels_ad_creatives cr
       JOIN reels_ad_campaigns c ON c.id = cr.campaign_id
       WHERE cr.campaign_id = $1 AND c.advertiser_id = $2
       ORDER BY cr.created_at DESC`,
      [campaignId, user.advertiserId],
    );
    res.json({ success: true, creatives: r.rows });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.post("/campaigns/:campaignId/creatives", adUpload.single("video"), async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  const campaignId = Number(req.params.campaignId);
  const body = req.body as {
    title?: string;
    durationSeconds?: string;
    skipAfterSeconds?: string;
    placement?: string;
    adType?: string;
    videoUrl?: string;
  };
  const title = String(body.title ?? "").trim();
  if (!title) {
    res.status(400).json({ success: false, message: "Ad title required" });
    return;
  }
  let videoUrl = String(body.videoUrl ?? "").trim();
  if (req.file) {
    videoUrl = `/uploads/reels/ads/${req.file.filename}`;
  }
  if (!videoUrl) {
    res.status(400).json({ success: false, message: "Video file or URL required" });
    return;
  }
  const placement = ["pre_roll", "mid_roll", "any"].includes(String(body.placement))
    ? String(body.placement)
    : "any";
  const adType = body.adType === "skippable" ? "skippable" : "non_skippable";
  const skipAfter = adType === "skippable" ? Number(body.skipAfterSeconds) || 5 : null;
  try {
    const own = await query(
      `SELECT id FROM reels_ad_campaigns WHERE id = $1 AND advertiser_id = $2`,
      [campaignId, user.advertiserId],
    );
    if (!own.rows.length) {
      res.status(404).json({ success: false, message: "Campaign not found" });
      return;
    }
    const r = await query(
      `INSERT INTO reels_ad_creatives
        (campaign_id, title, video_url, duration_seconds, skip_after_seconds, placement, ad_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        campaignId,
        title,
        videoUrl,
        Math.max(5, Number(body.durationSeconds) || 30),
        skipAfter,
        placement,
        adType,
      ],
    );
    res.json({ success: true, creative: r.rows[0] });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.get("/stats", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  try {
    const r = await query(
      `SELECT
         COALESCE(SUM(cr.impressions), 0)::bigint AS impressions,
         COALESCE(SUM(cr.completions), 0)::bigint AS completions,
         COALESCE(SUM(cr.skips), 0)::bigint AS skips,
         COUNT(cr.id)::int AS creatives
       FROM reels_ad_creatives cr
       JOIN reels_ad_campaigns c ON c.id = cr.campaign_id
       WHERE c.advertiser_id = $1`,
      [user.advertiserId],
    );
    res.json({ success: true, stats: r.rows[0] });
  } catch {
    res.status(500).json({ success: false });
  }
});

export default router;
