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
import {
  defaultBidForObjective,
  hashAdsPassword,
  topUpAdvertiserBalance,
  type ReelsAdObjective,
  verifyAdsAdvertiser,
} from "../lib/reelsAds";
import { getReelsPlatformConfig } from "../lib/reelsConfig";

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

const adMediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, adsUploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "") || ".bin";
      cb(null, `ad_${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
}).fields([
  { name: "video", maxCount: 1 },
  { name: "image", maxCount: 1 },
]);

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
      `INSERT INTO reels_advertisers (email, password_hash, company_name, contact_name, status, balance_inr)
       VALUES ($1, $2, $3, $4, 'active', 1000) RETURNING id, email, company_name`,
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

router.get("/pricing", async (_req, res) => {
  try {
    const cfg = await getReelsPlatformConfig();
    const ads = cfg.ads;
    res.json({
      success: true,
      pricing: {
        feedCpmInr: ads.feedCpmInr,
        feedCpcInr: ads.feedCpcInr,
        appInstallCpiInr: ads.appInstallCpiInr,
        videoCpvInr: ads.videoCpvInr,
        minTopUpInr: ads.minTopUpInr,
        feedAdEveryVideos: ads.feedAdEveryVideos,
        objectives: [
          { id: "brand_awareness", label: "Brand awareness", bidModel: "cpm", defaultBid: ads.feedCpmInr },
          { id: "shopping", label: "Shopping / e-commerce", bidModel: "cpc", defaultBid: ads.feedCpcInr },
          { id: "app_promotion", label: "App promotion", bidModel: "cpi", defaultBid: ads.appInstallCpiInr },
          { id: "video_views", label: "Video views (pre/mid-roll)", bidModel: "cpv", defaultBid: ads.videoCpvInr },
        ],
      },
    });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.post("/wallet/topup", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  const amount = Math.max(0, Number((req.body as { amountInr?: number }).amountInr) || 0);
  const cfg = await getReelsPlatformConfig();
  if (amount < cfg.ads.minTopUpInr) {
    res.status(400).json({ success: false, message: `Minimum top-up is ₹${cfg.ads.minTopUpInr}` });
    return;
  }
  try {
    await topUpAdvertiserBalance(user.advertiserId, amount);
    const r = await query(`SELECT balance_inr FROM reels_advertisers WHERE id = $1`, [user.advertiserId]);
    res.json({ success: true, balanceInr: r.rows[0]?.balance_inr });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.get("/campaigns", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  try {
    await ensureReelsAdsTables();
    const r = await query(
      `SELECT id, name, status, objective, bid_model, bid_amount_inr,
              daily_budget_inr, total_budget_inr, spent_inr, created_at
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
  const body = req.body as {
    name?: string;
    dailyBudgetInr?: number;
    totalBudgetInr?: number;
    objective?: string;
    bidModel?: string;
    bidAmountInr?: number;
  };
  const name = String(body.name ?? "").trim();
  if (!name) {
    res.status(400).json({ success: false, message: "Campaign name required" });
    return;
  }
  const objectives: ReelsAdObjective[] = ["brand_awareness", "video_views", "app_promotion", "shopping"];
  const objective = objectives.includes(body.objective as ReelsAdObjective)
    ? (body.objective as ReelsAdObjective)
    : "brand_awareness";
  try {
    await ensureReelsAdsTables();
    const cfg = await getReelsPlatformConfig();
    const defaults = defaultBidForObjective(objective, cfg.ads);
    const bidModel = ["cpm", "cpc", "cpv", "cpi"].includes(String(body.bidModel))
      ? String(body.bidModel)
      : defaults.bidModel;
    const bidAmount = Math.max(0.01, Number(body.bidAmountInr) || defaults.bidAmount);
    const r = await query(
      `INSERT INTO reels_ad_campaigns
        (advertiser_id, name, objective, bid_model, bid_amount_inr, daily_budget_inr, total_budget_inr)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        user.advertiserId,
        name,
        objective,
        bidModel,
        bidAmount,
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

router.post("/campaigns/:campaignId/creatives", (req, res) => {
  adMediaUpload(req, res, async (err) => {
    if (err) {
      res.status(400).json({ success: false, message: "Upload failed" });
      return;
    }
    const user = requireAdsUser(req, res);
    if (!user) return;
    const campaignId = Number(req.params.campaignId);
    const body = req.body as Record<string, string | undefined>;
    const title = String(body.title ?? "").trim();
    if (!title) {
      res.status(400).json({ success: false, message: "Ad title required" });
      return;
    }
    const format = ["video", "image", "app_install", "shopping"].includes(String(body.format))
      ? String(body.format)
      : "image";
    const files = req.files as { video?: Express.Multer.File[]; image?: Express.Multer.File[] } | undefined;
    let videoUrl = String(body.videoUrl ?? "").trim();
    let imageUrl = String(body.imageUrl ?? "").trim();
    if (files?.video?.[0]) videoUrl = `/uploads/reels/ads/${files.video[0].filename}`;
    if (files?.image?.[0]) imageUrl = `/uploads/reels/ads/${files.image[0].filename}`;

    if (format === "video" && !videoUrl) {
      res.status(400).json({ success: false, message: "Video required for video ads" });
      return;
    }
    if (format !== "video" && !imageUrl) {
      res.status(400).json({ success: false, message: "Image required for this ad type" });
      return;
    }
    if (format === "app_install" && !body.playStoreUrl && !body.appStoreUrl) {
      res.status(400).json({ success: false, message: "Play Store or App Store URL required" });
      return;
    }
    if (format === "shopping" && !body.destinationUrl) {
      res.status(400).json({ success: false, message: "Shop URL required" });
      return;
    }

    const placement = ["pre_roll", "mid_roll", "feed_instream", "any"].includes(String(body.placement))
      ? String(body.placement)
      : format === "video" ? "any" : "feed_instream";
    const adType = body.adType === "skippable" ? "skippable" : "non_skippable";
    const skipAfter = adType === "skippable" ? Number(body.skipAfterSeconds) || 5 : null;
    const ctaType = String(body.ctaType ?? (
      format === "shopping" ? "shop_now"
        : format === "app_install" ? "install"
          : "learn_more"
    ));
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
          (campaign_id, title, format, video_url, image_url, headline, description,
           duration_seconds, skip_after_seconds, placement, ad_type, cta_type,
           destination_url, play_store_url, app_store_url, app_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [
          campaignId,
          title,
          format,
          videoUrl || null,
          imageUrl || null,
          body.headline?.trim() || title,
          body.description?.trim() || null,
          format === "video" ? Math.max(5, Number(body.durationSeconds) || 30) : 0,
          skipAfter,
          placement,
          adType,
          ctaType,
          body.destinationUrl?.trim() || null,
          body.playStoreUrl?.trim() || null,
          body.appStoreUrl?.trim() || null,
          body.appName?.trim() || null,
        ],
      );
      res.json({ success: true, creative: r.rows[0] });
    } catch {
      res.status(500).json({ success: false });
    }
  });
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
         COALESCE(SUM(cr.clicks), 0)::bigint AS clicks,
         COALESCE(SUM(c.spent_inr), 0)::numeric AS spent_inr,
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
