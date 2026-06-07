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
  createAdsWalletOrder,
  getAdvertiserBalance,
  isAdsDemoEmail,
  listAdsPayments,
  verifyAdsWalletPayment,
} from "../lib/adsPortalBilling";
import {
  defaultBidForObjective,
  hashAdsPassword,
  topUpAdvertiserBalance,
  type ReelsAdObjective,
  verifyAdsAdvertiser,
} from "../lib/reelsAds";
import { getReelsPlatformConfig } from "../lib/reelsConfig";
import { AD_FORMATS_CATALOG, findAdFormat } from "../lib/adFormatsCatalog";
import { getAdvertiserDashboard } from "../lib/adsAnalytics";
import { getRazorpayConfig } from "../lib/razorpay";

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
    const starterBalance = isAdsDemoEmail(email) ? 1000 : 0;
    const ins = await query(
      `INSERT INTO reels_advertisers (email, password_hash, company_name, contact_name, status, balance_inr)
       VALUES ($1, $2, $3, $4, 'active', $5) RETURNING id, email, company_name`,
      [email, hashAdsPassword(password), companyName, body.contactName?.trim() || null, starterBalance],
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
        adFormats: AD_FORMATS_CATALOG,
        placements: [
          { id: "pre_roll", label: "Pre-roll (before video)" },
          { id: "mid_roll", label: "Mid-roll (during video)" },
          { id: "feed_instream", label: "Home feed (between videos)" },
          { id: "shorts_feed", label: "Shorts vertical feed" },
          { id: "search_promoted", label: "Search & discovery" },
          { id: "channel_banner", label: "Channel masthead" },
          { id: "video_overlay", label: "Video overlay" },
        ],
      },
    });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.get("/wallet/config", async (req, res) => {
  const user = getAdsPortalUser(req);
  const { configured, keyId } = getRazorpayConfig();
  const cfg = await getReelsPlatformConfig();
  res.json({
    success: true,
    razorpayConfigured: configured,
    razorpayKeyId: configured ? keyId : null,
    minTopUpInr: cfg.ads.minTopUpInr,
    isDemoAccount: user ? isAdsDemoEmail(user.email) : false,
    paymentRequired: true,
  });
});

router.get("/wallet/payments", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  try {
    const payments = await listAdsPayments(user.advertiserId);
    res.json({ success: true, payments });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.post("/wallet/create-order", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  const amount = Math.max(0, Number((req.body as { amountInr?: number }).amountInr) || 0);
  const cfg = await getReelsPlatformConfig();
  if (amount < cfg.ads.minTopUpInr) {
    res.status(400).json({ success: false, message: `Minimum payment is ₹${cfg.ads.minTopUpInr}` });
    return;
  }
  try {
    const checkout = await createAdsWalletOrder(user.advertiserId, amount);
    res.json({ success: true, checkout });
  } catch (err) {
    res.status(503).json({
      success: false,
      message: err instanceof Error ? err.message : "Could not start payment",
    });
  }
});

router.post("/wallet/verify-payment", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  const body = req.body as {
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
  };
  try {
    const result = await verifyAdsWalletPayment({
      advertiserId: user.advertiserId,
      razorpayOrderId: String(body.razorpayOrderId ?? ""),
      razorpayPaymentId: String(body.razorpayPaymentId ?? ""),
      razorpaySignature: String(body.razorpaySignature ?? ""),
    });
    res.json({ success: true, balanceInr: result.balanceInr });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : "Payment verification failed",
    });
  }
});

/** Internal demo credit — only pjhawithu@gmail.com (ADS_DEMO_EMAIL). */
router.post("/wallet/demo-topup", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  if (!isAdsDemoEmail(user.email)) {
    res.status(403).json({ success: false, message: "Demo top-up is not available for this account." });
    return;
  }
  const amount = Math.max(0, Number((req.body as { amountInr?: number }).amountInr) || 0);
  if (amount <= 0 || amount > 5000) {
    res.status(400).json({ success: false, message: "Demo amount must be between ₹1 and ₹5000" });
    return;
  }
  try {
    await topUpAdvertiserBalance(user.advertiserId, amount);
    const bal = await getAdvertiserBalance(user.advertiserId);
    res.json({ success: true, balanceInr: bal, demo: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.get("/dashboard", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  try {
    const dashboard = await getAdvertiserDashboard(user.advertiserId);
    res.json({ success: true, dashboard });
  } catch {
    res.status(500).json({ success: false, message: "Failed to load dashboard" });
  }
});

router.get("/campaigns", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  try {
    await ensureReelsAdsTables();
    const r = await query(
      `SELECT id, name, status, objective, bid_model, bid_amount_inr,
              daily_budget_inr, total_budget_inr, spent_inr,
              start_date::text, end_date::text, created_at
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
    startDate?: string;
    endDate?: string;
  };
  const name = String(body.name ?? "").trim();
  if (!name) {
    res.status(400).json({ success: false, message: "Campaign name required" });
    return;
  }
  const cfg = await getReelsPlatformConfig();
  const balance = await getAdvertiserBalance(user.advertiserId);
  if (balance < cfg.ads.minTopUpInr && !isAdsDemoEmail(user.email)) {
    res.status(402).json({
      success: false,
      message: `Add at least ₹${cfg.ads.minTopUpInr} to your wallet before creating campaigns.`,
      code: "PAYMENT_REQUIRED",
    });
    return;
  }
  const objectives: ReelsAdObjective[] = ["brand_awareness", "video_views", "app_promotion", "shopping"];
  const objective = objectives.includes(body.objective as ReelsAdObjective)
    ? (body.objective as ReelsAdObjective)
    : "brand_awareness";
  try {
    await ensureReelsAdsTables();
    const defaults = defaultBidForObjective(objective, cfg.ads);
    const bidModel = ["cpm", "cpc", "cpv", "cpi"].includes(String(body.bidModel))
      ? String(body.bidModel)
      : defaults.bidModel;
    const bidAmount = Math.max(0.01, Number(body.bidAmountInr) || defaults.bidAmount);
    const startDate = String(body.startDate ?? "").trim() || new Date().toISOString().slice(0, 10);
    const defaultEnd = new Date();
    defaultEnd.setDate(defaultEnd.getDate() + 30);
    const endDate = String(body.endDate ?? "").trim() || defaultEnd.toISOString().slice(0, 10);
    const r = await query(
      `INSERT INTO reels_ad_campaigns
        (advertiser_id, name, objective, bid_model, bid_amount_inr, daily_budget_inr, total_budget_inr, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date) RETURNING *`,
      [
        user.advertiserId,
        name,
        objective,
        bidModel,
        bidAmount,
        Math.max(100, Number(body.dailyBudgetInr) || 500),
        Math.max(500, Number(body.totalBudgetInr) || 5000),
        startDate,
        endDate,
      ],
    );
    res.json({ success: true, campaign: r.rows[0] });
  } catch {
    res.status(500).json({ success: false });
  }
});

router.get("/creatives", async (req, res) => {
  const user = requireAdsUser(req, res);
  if (!user) return;
  try {
    const r = await query(
      `SELECT cr.id, cr.title, cr.format, cr.placement, cr.moderation_status, cr.moderation_reason,
              cr.impressions, cr.clicks, cr.created_at, camp.name AS campaign_name
       FROM reels_ad_creatives cr
       JOIN reels_ad_campaigns camp ON camp.id = cr.campaign_id
       WHERE camp.advertiser_id = $1
       ORDER BY cr.created_at DESC`,
      [user.advertiserId],
    );
    res.json({ success: true, creatives: r.rows });
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
    const balance = await getAdvertiserBalance(user.advertiserId);
    if (balance <= 0 && !isAdsDemoEmail(user.email)) {
      res.status(402).json({
        success: false,
        message: "Pay and add funds to your wallet before publishing ads.",
        code: "PAYMENT_REQUIRED",
      });
      return;
    }
    const specFromId = body.adFormatId ? findAdFormat(String(body.adFormatId)) : undefined;
    const allowedFormats = ["video", "image", "app_install", "shopping", "bumper", "shorts_video", "carousel", "lead_form"];
    const format = specFromId?.format
      ?? (allowedFormats.includes(String(body.format)) ? String(body.format) : "image");
    const files = req.files as { video?: Express.Multer.File[]; image?: Express.Multer.File[] } | undefined;
    let videoUrl = String(body.videoUrl ?? "").trim();
    let imageUrl = String(body.imageUrl ?? "").trim();
    if (files?.video?.[0]) videoUrl = `/uploads/reels/ads/${files.video[0].filename}`;
    if (files?.image?.[0]) imageUrl = `/uploads/reels/ads/${files.image[0].filename}`;

    const needsVideo = specFromId?.requiresVideo ?? ["video", "bumper", "shorts_video"].includes(format);
    const needsImage = specFromId?.requiresImage ?? !needsVideo;
    if (needsVideo && !videoUrl) {
      res.status(400).json({ success: false, message: "Video required for this ad format" });
      return;
    }
    if (needsImage && !imageUrl && format !== "video") {
      res.status(400).json({ success: false, message: "Image required for this ad format" });
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

    const allowedPlacements = ["pre_roll", "mid_roll", "feed_instream", "shorts_feed", "search_promoted", "channel_banner", "video_overlay", "any"];
    const placement = specFromId?.placement
      ?? (allowedPlacements.includes(String(body.placement)) ? String(body.placement) : format === "shorts_video" ? "shorts_feed" : format === "video" || format === "bumper" ? "any" : "feed_instream");
    const adTypeRaw = specFromId?.adType ?? String(body.adType ?? "non_skippable");
    const adType = ["skippable", "bumper"].includes(adTypeRaw) ? adTypeRaw : "non_skippable";
    const skipAfter = adType === "skippable"
      ? (specFromId?.skipAfterSeconds ?? (Number(body.skipAfterSeconds) || 5))
      : null;
    const maxDur = specFromId?.maxDurationSeconds;
    const ctaType = String(body.ctaType ?? (
      format === "shopping" ? "shop_now"
        : format === "app_install" ? "install"
          : format === "lead_form" ? "learn_more"
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
           destination_url, play_store_url, app_store_url, app_name, moderation_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'pending_review') RETURNING *`,
        [
          campaignId,
          title,
          format,
          videoUrl || null,
          imageUrl || null,
          body.headline?.trim() || title,
          body.description?.trim() || null,
          needsVideo
            ? Math.min(
              maxDur ?? 120,
              Math.max(format === "bumper" ? 6 : 5, Number(body.durationSeconds) || (format === "bumper" ? 6 : format === "shorts_video" ? 15 : 30)),
            )
            : 0,
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
      res.json({
        success: true,
        creative: r.rows[0],
        message: "Ad submitted for Videh admin review. It will go live after approval.",
      });
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
