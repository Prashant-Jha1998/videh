import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { query } from "../lib/db";
import { enforceModerationForActivity } from "../lib/moderation";
import { assertSameUser } from "../lib/auth";
import { publicMediaUrl } from "../lib/mediaStorage";

const router = Router();
const MAX_VIDEO_STORY_DURATION_MS = 60000;
const currentFilePath = fileURLToPath(import.meta.url);
const routesDir = path.dirname(currentFilePath);
const apiServerDir = path.resolve(routesDir, "../..");
const statusUploadsDir = path.join(apiServerDir, "uploads", "statuses");
fs.mkdirSync(statusUploadsDir, { recursive: true });

const statusMediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, statusUploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "") || mediaExtension(file.mimetype);
      const safeExt = ext.replace(/[^.\w]/g, "") || ".bin";
      cb(null, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}${safeExt}`);
    },
  }),
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowedExt = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".m4v", ".3gp", ".aac", ".m4a", ".mp3"]);
    if (/^(image|video|audio)\//.test(file.mimetype) || file.mimetype === "application/octet-stream" || allowedExt.has(ext)) cb(null, true);
    else cb(new Error("Only image, video, and audio files are allowed."));
  },
});

function mediaExtension(mime: string): string {
  if (mime === "video/quicktime") return ".mov";
  if (mime === "video/mp4") return ".mp4";
  if (mime === "video/3gpp") return ".3gp";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "audio/mpeg") return ".mp3";
  if (mime === "audio/mp4") return ".m4a";
  if (mime === "audio/aac") return ".aac";
  return mime.startsWith("image/") ? ".jpg" : ".bin";
}

function runStatusMediaUpload(req: Request, res: Response, next: NextFunction): void {
  statusMediaUpload.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
      ? "Story media is too large. Please choose a video under 150 MB."
      : err instanceof Error
        ? err.message
        : "Could not upload story media.";
    res.status(400).json({ success: false, message });
  });
}

const BOOST_BASE_PRICE_INR = 499;
const BOOST_DAY_PRICE_INR = 299;
const BOOST_RADIUS_PRICE_INR = 12;
const BOOST_CITY_PRICE_INR = 350;
const BOOST_STATE_PRICE_INR = 700;
const BOOST_MIN_DAYS = 1;
const BOOST_MAX_DAYS = 30;
const BOOST_MIN_RADIUS_KM = 5;
const BOOST_MAX_RADIUS_KM = 500;

let statusEditorColumnsEnsured = false;
async function ensureStatusEditorColumns(): Promise<void> {
  if (statusEditorColumnsEnsured) return;
  await query("ALTER TABLE statuses ADD COLUMN IF NOT EXISTS editor_data JSONB");
  statusEditorColumnsEnsured = true;
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function cleanText(value: unknown, maxLength: number): string | null {
  const s = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  return s.slice(0, maxLength);
}

function calculateBoostPlan(input: { durationDays: unknown; radiusKm: unknown; targetCity?: unknown; targetState?: unknown }) {
  const durationDays = clampInt(input.durationDays, BOOST_MIN_DAYS, BOOST_MAX_DAYS);
  const radiusKm = clampInt(input.radiusKm, BOOST_MIN_RADIUS_KM, BOOST_MAX_RADIUS_KM);
  const targetCity = cleanText(input.targetCity, 80);
  const targetState = cleanText(input.targetState, 80);
  const amountInr =
    BOOST_BASE_PRICE_INR +
    durationDays * BOOST_DAY_PRICE_INR +
    radiusKm * BOOST_RADIUS_PRICE_INR +
    (targetCity ? BOOST_CITY_PRICE_INR : 0) +
    (targetState ? BOOST_STATE_PRICE_INR : 0);
  const estimatedReach = Math.round(1200 + durationDays * 1800 + radiusKm * 95 + (targetCity ? 2500 : 0) + (targetState ? 5000 : 0));
  return { amountInr, durationDays, radiusKm, targetCity, targetState, estimatedReach };
}

function getRazorpayConfig() {
  const keyId = (process.env["RAZORPAY_KEY_ID"] ?? process.env["VITE_RAZORPAY_KEY_ID"] ?? "").trim();
  const keySecret = (process.env["RAZORPAY_KEY_SECRET"] ?? "").trim();
  return { keyId, keySecret, configured: Boolean(keyId && keySecret) };
}

async function razorpayRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { keyId, keySecret, configured } = getRazorpayConfig();
  if (!configured) throw new Error("Razorpay is not configured.");

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: { description?: string } }).error?.description ?? "Razorpay request failed.");
  }
  return data as T;
}

async function createRazorpayOrder(args: {
  amountInr: number;
  receipt: string;
  notes: Record<string, string | number | null>;
}) {
  return razorpayRequest<{ id: string; amount: number; currency: string; receipt: string; status: string }>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amountInr * 100,
      currency: "INR",
      receipt: args.receipt,
      notes: args.notes,
    }),
  });
}

function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const { keySecret, configured } = getRazorpayConfig();
  if (!configured) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

type RazorpayPayment = {
  id: string;
  order_id?: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  captured?: boolean;
};

async function ensureRazorpayPaymentCaptured(args: {
  orderId: string;
  paymentId: string;
  amountInr: number;
}): Promise<RazorpayPayment> {
  const expectedAmount = args.amountInr * 100;
  let payment = await razorpayRequest<RazorpayPayment>(`/payments/${encodeURIComponent(args.paymentId)}`);
  if (payment.order_id !== args.orderId) throw new Error("Payment order mismatch.");
  if (payment.currency !== "INR" || payment.amount !== expectedAmount) throw new Error("Payment amount mismatch.");

  if (payment.status === "captured" || payment.captured) return payment;

  if (payment.status !== "authorized") {
    throw new Error(`Payment is not capturable. Current status: ${payment.status}.`);
  }

  payment = await razorpayRequest<RazorpayPayment>(`/payments/${encodeURIComponent(args.paymentId)}/capture`, {
    method: "POST",
    body: JSON.stringify({
      amount: expectedAmount,
      currency: "INR",
    }),
  });

  if (payment.status !== "captured" && !payment.captured) {
    throw new Error(`Payment capture failed. Current status: ${payment.status}.`);
  }
  return payment;
}

let boostTablesEnsured = false;
async function ensureBoostTables(): Promise<void> {
  if (boostTablesEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS status_boosts (
      id SERIAL PRIMARY KEY,
      status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_inr INTEGER NOT NULL,
      duration_hours INTEGER NOT NULL,
      estimated_reach INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_verification',
      payment_status TEXT NOT NULL DEFAULT 'paid',
      payment_provider TEXT NOT NULL DEFAULT 'manual',
      payment_reference TEXT,
      target_state TEXT,
      target_city TEXT,
      target_radius_km INTEGER NOT NULL DEFAULT 10,
      duration_days INTEGER NOT NULL DEFAULT 1,
      verification_note TEXT,
      verified_at TIMESTAMPTZ,
      rejected_at TIMESTAMPTZ,
      pending_hold_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    ALTER TABLE status_boosts
      ADD COLUMN IF NOT EXISTS target_state TEXT,
      ADD COLUMN IF NOT EXISTS target_city TEXT,
      ADD COLUMN IF NOT EXISTS target_radius_km INTEGER NOT NULL DEFAULT 10,
      ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid',
      ADD COLUMN IF NOT EXISTS verification_note TEXT,
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS pending_hold_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
  `);
  await query("ALTER TABLE status_boosts ALTER COLUMN starts_at DROP NOT NULL");
  await query(`
    CREATE INDEX IF NOT EXISTS idx_status_boosts_active
      ON status_boosts (status_id, ends_at)
      WHERE status = 'active'
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_status_boosts_user_created
      ON status_boosts (user_id, created_at DESC)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_status_boosts_status_created
      ON status_boosts (status, created_at DESC)
  `);
  boostTablesEnsured = true;
}

// Get all active statuses for contacts
router.get("/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (!assertSameUser(req, res, userId)) return;
  try {
    await ensureBoostTables();
    await ensureStatusEditorColumns();
    const result = await query(`
      SELECT
        s.id, s.user_id, s.content, s.type, s.background_color,
        s.media_url, s.editor_data, s.expires_at, s.created_at,
        u.name AS user_name, u.avatar_url AS user_avatar,
        EXISTS(
          SELECT 1 FROM status_boosts sb
          WHERE sb.status_id = s.id
            AND sb.status = 'active'
            AND sb.ends_at > NOW()
        ) AS is_boosted,
        (
          SELECT MAX(sb.ends_at) FROM status_boosts sb
          WHERE sb.status_id = s.id
            AND sb.status = 'active'
            AND sb.ends_at > NOW()
        ) AS boost_ends_at,
        (
          SELECT sb.status FROM status_boosts sb
          WHERE sb.status_id = s.id
            AND sb.payment_status IN ('paid', 'captured')
            AND sb.status IN ('pending_verification', 'active', 'rejected')
          ORDER BY sb.created_at DESC
          LIMIT 1
        ) AS boost_status,
        (
          SELECT sb.verification_note FROM status_boosts sb
          WHERE sb.status_id = s.id
            AND sb.payment_status IN ('paid', 'captured')
            AND sb.status IN ('pending_verification', 'active', 'rejected')
          ORDER BY sb.created_at DESC
          LIMIT 1
        ) AS boost_verification_note,
        EXISTS(
          SELECT 1 FROM status_views sv
          WHERE sv.status_id = s.id AND sv.viewer_id = $1::int
        ) AS viewed,
        (SELECT COUNT(*) FROM status_views sv2 WHERE sv2.status_id = s.id) AS view_count,
        (SELECT COUNT(*) FROM status_reactions sr WHERE sr.status_id = s.id) AS reaction_count,
        (SELECT emoji FROM status_reactions WHERE status_id = s.id AND user_id = $1::int LIMIT 1) AS my_reaction
      FROM statuses s
      JOIN users u ON u.id = s.user_id
      WHERE s.expires_at > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM blocked_users b
          WHERE (b.blocker_id = $1::int AND b.blocked_id = s.user_id)
             OR (b.blocker_id = s.user_id AND b.blocked_id = $1::int)
        )
        AND (
          s.user_id = $1::int
          OR s.user_id IN (
            -- Contacts table based visibility (when contact sync exists)
            SELECT c1.contact_user_id
            FROM contacts c1
            JOIN contacts c2
              ON c2.user_id = c1.contact_user_id
             AND c2.contact_user_id = $1::int
             AND c2.is_blocked = FALSE
            WHERE c1.user_id = $1::int AND c1.is_blocked = FALSE
          )
          OR s.user_id IN (
            -- Chat based visibility fallback so active chat contacts can see status
            SELECT cm_other.user_id
            FROM chat_members cm_self
            JOIN chat_members cm_other ON cm_other.chat_id = cm_self.chat_id
            JOIN chats c ON c.id = cm_self.chat_id
            WHERE cm_self.user_id = $1::int
              AND cm_other.user_id != $1::int
              AND c.is_group = FALSE
          )
          OR EXISTS(
            -- Paid boosts can reach users outside contacts while the story is active.
            SELECT 1 FROM status_boosts sb
            WHERE sb.status_id = s.id
              AND sb.status = 'active'
              AND sb.ends_at > NOW()
          )
        )
      ORDER BY EXISTS(
        SELECT 1 FROM status_boosts sb
        WHERE sb.status_id = s.id
          AND sb.status = 'active'
          AND sb.ends_at > NOW()
      ) DESC, s.created_at DESC
    `, [userId]);

    res.json({ success: true, statuses: result.rows });
  } catch (err) {
    req.log.error({ err }, "get statuses error");
    res.status(500).json({ success: false });
  }
});

router.get("/boost/quote", async (req: Request, res: Response) => {
  const plan = calculateBoostPlan({
    durationDays: req.query["durationDays"],
    radiusKm: req.query["radiusKm"],
    targetCity: req.query["targetCity"],
    targetState: req.query["targetState"],
  });
  res.json({
    success: true,
    plan,
    razorpayKeyId: getRazorpayConfig().keyId || null,
    note: "Payment is required first; boost starts only after admin verification.",
  });
});

router.post("/media", runStatusMediaUpload, (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, message: "Media file is required." });
    return;
  }
  const relPath = `/uploads/statuses/${encodeURIComponent(file.filename)}`;
  res.json({
    success: true,
    url: publicMediaUrl(req, relPath),
    mimeType: file.mimetype,
    size: file.size,
  });
});

router.post("/:statusId/boost/order", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { userId, durationDays, radiusKm, targetCity, targetState } = req.body as {
    userId?: number;
    durationDays?: number;
    radiusKm?: number;
    targetCity?: string;
    targetState?: string;
  };
  if (!userId) {
    res.status(400).json({ success: false, message: "userId is required." });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;

  try {
    await ensureBoostTables();
    const owner = await query(
      "SELECT id FROM statuses WHERE id = $1 AND user_id = $2 AND expires_at > NOW()",
      [statusId, userId],
    );
    if (owner.rows.length === 0) {
      res.status(404).json({ success: false, message: "Active status not found." });
      return;
    }

    const plan = calculateBoostPlan({ durationDays, radiusKm, targetCity, targetState });
    const order = await createRazorpayOrder({
      amountInr: plan.amountInr,
      receipt: `status_boost_${statusId}_${Date.now()}`.slice(0, 40),
      notes: {
        statusId: String(statusId),
        userId,
        durationDays: plan.durationDays,
        radiusKm: plan.radiusKm,
        targetCity: plan.targetCity,
        targetState: plan.targetState,
      },
    });

    res.json({
      success: true,
      keyId: getRazorpayConfig().keyId,
      order,
      plan,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err instanceof Error ? err.message : "Could not create order." });
  }
});

// Payment-first boost request. Admin approval is required before promoted delivery starts.
router.post("/:statusId/boost", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const {
    userId,
    amountInr,
    durationDays,
    radiusKm,
    targetCity,
    targetState,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  } = req.body as {
    userId?: number;
    amountInr?: number;
    durationDays?: number;
    radiusKm?: number;
    targetCity?: string;
    targetState?: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
  };
  const plan = calculateBoostPlan({ durationDays, radiusKm, targetCity, targetState });
  if (!userId || Number(amountInr) !== plan.amountInr || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    res.status(400).json({ success: false, message: "Invalid payment or boost plan." });
    return;
  }
  if (!assertSameUser(req, res, userId)) return;
  if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    res.status(400).json({ success: false, message: "Payment signature verification failed." });
    return;
  }

  try {
    await ensureBoostTables();
    const owner = await query(
      "SELECT id FROM statuses WHERE id = $1 AND user_id = $2 AND expires_at > NOW()",
      [statusId, userId],
    );
    if (owner.rows.length === 0) {
      res.status(404).json({ success: false, message: "Active status not found." });
      return;
    }

    await ensureRazorpayPaymentCaptured({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      amountInr: plan.amountInr,
    });

    const result = await query(`
      INSERT INTO status_boosts (
        status_id, user_id, amount_inr, duration_hours, duration_days, estimated_reach,
        target_state, target_city, target_radius_km,
        status, payment_status, payment_provider, payment_reference, pending_hold_until, ends_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        'pending_verification', 'captured', $10, $11,
        NOW() + INTERVAL '24 hours',
        NOW() + INTERVAL '24 hours'
      )
      RETURNING *
    `, [
      statusId,
      userId,
      plan.amountInr,
      plan.durationDays * 24,
      plan.durationDays,
      plan.estimatedReach,
      plan.targetState,
      plan.targetCity,
      plan.radiusKm,
      "razorpay",
      razorpayPaymentId.trim(),
    ]);

    await query(
      `UPDATE statuses
       SET expires_at = GREATEST(expires_at, NOW() + INTERVAL '24 hours')
       WHERE id = $1 AND user_id = $2`,
      [statusId, userId],
    );

    res.json({
      success: true,
      boost: result.rows[0],
      plan,
      message: "Payment received. Boost is pending admin verification and can be approved within 24 hours.",
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

router.get("/:statusId/boost/analytics", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const ownerId = Number(req.query["ownerId"]);
  if (!ownerId) {
    res.status(400).json({ success: false, message: "ownerId is required." });
    return;
  }
  if (!assertSameUser(req, res, ownerId)) return;

  try {
    await ensureBoostTables();
    const boost = await query(`
      SELECT *
      FROM status_boosts
      WHERE status_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [statusId, ownerId]);
    if (!boost.rows[0]) {
      res.status(404).json({ success: false, message: "Boost not found." });
      return;
    }
    const startAt = boost.rows[0].starts_at ?? boost.rows[0].verified_at ?? boost.rows[0].created_at;
    const viewers = await query(`
      SELECT u.id, u.name, sv.viewed_at
      FROM status_views sv
      JOIN users u ON u.id = sv.viewer_id
      WHERE sv.status_id = $1
        AND sv.viewed_at >= $2
      ORDER BY sv.viewed_at DESC
      LIMIT 500
    `, [statusId, startAt]);

    res.json({
      success: true,
      boost: boost.rows[0],
      boostedViewCount: viewers.rows.length,
      viewers: viewers.rows.map((v: any) => ({
        id: v.id,
        name: v.name ?? "Videh user",
        viewedAt: v.viewed_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Post a status
router.post("/", async (req: Request, res: Response) => {
  const { userId, content, type, backgroundColor, mediaUrl, videoDurationMs, editorData } = req.body as {
    userId?: number; content?: string; type?: string; backgroundColor?: string; mediaUrl?: string; videoDurationMs?: number | null; editorData?: unknown;
  };
  if (!userId || !content) { res.status(400).json({ success: false }); return; }
  if (!assertSameUser(req, res, userId)) return;
  if (type === "video") {
    const durationMs = Number(videoDurationMs);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      res.status(400).json({ success: false, message: "Video duration is required for video stories." });
      return;
    }
    if (durationMs > MAX_VIDEO_STORY_DURATION_MS) {
      res.status(400).json({ success: false, message: "Video story can be up to 1 minute only." });
      return;
    }
  }
  try {
    await ensureStatusEditorColumns();
    const activityType = type === "video" ? "video_share" : "story_status";
    const mod = await enforceModerationForActivity(userId, activityType, {
      content,
      mediaUrl: mediaUrl ?? null,
      type: type ?? "text",
    });
    if (!mod.allowed) {
      res.status(403).json({
        success: false,
        code: mod.code,
        message: mod.message,
        suspendedUntil: mod.suspendedUntil ?? null,
        alert: mod.alert,
        strikeCount: mod.strikeCount,
      });
      return;
    }

    const result = await query(`
      INSERT INTO statuses (user_id, content, type, background_color, media_url, editor_data, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW() + INTERVAL '24 hours')
      RETURNING *
    `, [userId, content, type ?? "text", backgroundColor ?? "#00A884", mediaUrl ?? null, editorData ? JSON.stringify(editorData) : null]);
    res.json({ success: true, status: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Mark status as viewed
router.post("/:statusId/view", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { viewerId } = req.body as { viewerId?: number };
  try {
    await query(
      "INSERT INTO status_views (status_id, viewer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [statusId, viewerId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Get viewers list with their reactions (only status owner can see this)
router.get("/:statusId/viewers", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { ownerId } = req.query as { ownerId?: string };
  try {
    const result = await query(`
      SELECT
        u.id, u.name, u.avatar_url AS avatar,
        sv.viewed_at,
        sr.emoji AS reaction
      FROM status_views sv
      JOIN users u ON u.id = sv.viewer_id
      LEFT JOIN status_reactions sr ON sr.status_id = sv.status_id AND sr.user_id = sv.viewer_id
      WHERE sv.status_id = $1
        AND ($2::int IS NULL OR (
          SELECT user_id FROM statuses WHERE id = $1
        ) = $2::int)
      ORDER BY sv.viewed_at DESC
    `, [statusId, ownerId ?? null]);

    // Aggregate reaction counts
    const reactionMap: Record<string, number> = {};
    result.rows.forEach((r: any) => {
      if (r.reaction) reactionMap[r.reaction] = (reactionMap[r.reaction] ?? 0) + 1;
    });

    res.json({
      success: true,
      viewers: result.rows,
      viewCount: result.rows.length,
      reactions: reactionMap,
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Add or update a reaction
router.post("/:statusId/react", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { userId, emoji } = req.body as { userId?: number; emoji?: string };
  if (!userId || !emoji) { res.status(400).json({ success: false }); return; }
  if (!assertSameUser(req, res, userId)) return;
  try {
    await query(`
      INSERT INTO status_reactions (status_id, user_id, emoji)
      VALUES ($1, $2, $3)
      ON CONFLICT (status_id, user_id) DO UPDATE SET emoji = $3, reacted_at = NOW()
    `, [statusId, userId, emoji]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Remove a reaction
router.delete("/:statusId/react", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { userId } = req.body as { userId?: number };
  if (!assertSameUser(req, res, userId)) return;
  try {
    await query("DELETE FROM status_reactions WHERE status_id = $1 AND user_id = $2", [statusId, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// Delete status
router.delete("/:statusId", async (req: Request, res: Response) => {
  const { statusId } = req.params;
  const { userId } = req.body as { userId?: number };
  if (!assertSameUser(req, res, userId)) return;
  try {
    await query("DELETE FROM statuses WHERE id = $1 AND user_id = $2", [statusId, userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

export default router;
