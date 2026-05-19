import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";
import { logger } from "../lib/logger";
import {
  createRazorpayOrder,
  ensureRazorpayPaymentCaptured,
  getRazorpayConfig,
  verifyRazorpaySignature,
} from "../lib/razorpay";

const router = Router();

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const ENTITY_TYPES = new Set(["pvt_ltd", "llp", "proprietorship", "partnership", "other"]);

export const DEVELOPER_PLANS = {
  starter: { id: "starter", name: "Starter", amountInr: 2999 },
  growth: { id: "growth", name: "Growth", amountInr: 9999 },
  enterprise: { id: "enterprise", name: "Enterprise", amountInr: 0 },
} as const;

export type DeveloperPlanId = keyof typeof DEVELOPER_PLANS;

export const DEVELOPER_STATUSES = [
  "payment_pending",
  "paid",
  "documents_review",
  "channel_setup",
  "templates_review",
  "approved",
  "rejected",
] as const;

function clientKey(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0]!.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const row = rateMap.get(key);
  if (!row || row.resetAt < now) {
    rateMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  row.count += 1;
  return row.count > RATE_LIMIT;
}

function referenceCode(): string {
  const part = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `VWA-${part}`;
}

export async function ensureDeveloperLeadsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS developer_leads (
      id SERIAL PRIMARY KEY,
      reference_code TEXT NOT NULL UNIQUE,
      company_name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      website TEXT,
      gstin TEXT,
      monthly_volume TEXT NOT NULL DEFAULT 'under_10k',
      use_case TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'payment_pending',
      plan_id TEXT,
      amount_inr INTEGER NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'none',
      razorpay_order_id TEXT,
      razorpay_payment_id TEXT,
      payment_method TEXT,
      paid_at TIMESTAMPTZ,
      admin_notes TEXT,
      assigned_admin TEXT,
      reviewed_at TIMESTAMPTZ,
      approval_phase TEXT NOT NULL DEFAULT 'payment',
      source_ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS plan_id TEXT`);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS amount_inr INTEGER NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none'`);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT`);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT`);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS payment_method TEXT`);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS admin_notes TEXT`);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS assigned_admin TEXT`);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS approval_phase TEXT NOT NULL DEFAULT 'payment'`);
}

router.get("/", (_req, res) => {
  const { configured, keyId } = getRazorpayConfig();
  res.json({
    success: true,
    service: "Videh Business Messaging API — Developer leads",
    razorpayConfigured: configured,
    razorpayKeyId: configured ? keyId : null,
    plans: Object.values(DEVELOPER_PLANS),
    apply: "POST /api/developer-leads",
    verifyPayment: "POST /api/developer-leads/verify-payment",
  });
});

router.post("/", async (req: Request, res: Response) => {
  const ip = clientKey(req);
  if (rateLimited(ip)) {
    res.status(429).json({ success: false, message: "Too many requests. Try again later." });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const companyName = String(body.companyName ?? "").trim();
  const entityType = String(body.entityType ?? "pvt_ltd").trim();
  const contactName = String(body.contactName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const website = String(body.website ?? "").trim() || null;
  const gstin = String(body.gstin ?? "").trim() || null;
  const monthlyVolume = String(body.monthlyVolume ?? "under_10k").trim() || "under_10k";
  const useCase = String(body.useCase ?? "").trim() || null;
  const message = String(body.message ?? "").trim() || null;
  const planId = String(body.planId ?? "starter").trim() as DeveloperPlanId;
  const plan = DEVELOPER_PLANS[planId in DEVELOPER_PLANS ? planId : "starter"];

  if (companyName.length < 2 || contactName.length < 2 || phone.length < 8) {
    res.status(400).json({
      success: false,
      message: "Company name, contact name, and phone are required.",
    });
    return;
  }

  if (!ENTITY_TYPES.has(entityType)) {
    res.status(400).json({ success: false, message: "Invalid entity type." });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "Valid work email is required." });
    return;
  }

  try {
    await ensureDeveloperLeadsTable();
    const reference = referenceCode();
    const { configured } = getRazorpayConfig();
    const needsPayment = plan.amountInr > 0 && configured;
    const initialStatus = needsPayment ? "payment_pending" : "paid";
    const paymentStatus = needsPayment ? "pending" : plan.amountInr === 0 ? "waived" : "paid";
    const approvalPhase = needsPayment ? "payment" : "documents";

    const insert = await query(
      `INSERT INTO developer_leads
       (reference_code, company_name, entity_type, contact_name, email, phone,
        website, gstin, monthly_volume, use_case, message, status, plan_id, amount_inr,
        payment_status, approval_phase, source_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id`,
      [
        reference,
        companyName,
        entityType,
        contactName,
        email,
        phone,
        website,
        gstin,
        monthlyVolume,
        useCase,
        message,
        initialStatus,
        plan.id,
        plan.amountInr,
        paymentStatus,
        approvalPhase,
        ip,
      ],
    );

    const leadId = Number(insert.rows[0]?.id);
    let checkout: { orderId: string; amountInr: number; keyId: string; currency: string } | null = null;

    if (needsPayment) {
      const order = await createRazorpayOrder({
        amountInr: plan.amountInr,
        receipt: reference.slice(0, 40),
        notes: { leadId, planId: plan.id, company: companyName.slice(0, 80) },
      });
      await query(`UPDATE developer_leads SET razorpay_order_id = $1 WHERE id = $2`, [order.id, leadId]);
      checkout = {
        orderId: order.id,
        amountInr: plan.amountInr,
        keyId: getRazorpayConfig().keyId,
        currency: "INR",
      };
    }

    logger.info({ reference, leadId, planId: plan.id, needsPayment }, "developer lead submitted");

    res.status(201).json({
      success: true,
      leadId,
      reference,
      status: initialStatus,
      needsPayment,
      checkout,
      message: needsPayment
        ? "Complete card payment (debit/credit) to submit for admin review."
        : "Application received. Admin will review within 1–2 business days.",
    });
  } catch (err) {
    req.log.error({ err }, "developer lead insert");
    res.status(500).json({ success: false, message: "Could not save application. Try again later." });
  }
});

router.post("/verify-payment", async (req: Request, res: Response) => {
  const body = req.body as {
    leadId?: number;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
  };

  const leadId = Number(body.leadId);
  const orderId = String(body.razorpayOrderId ?? "").trim();
  const paymentId = String(body.razorpayPaymentId ?? "").trim();
  const signature = String(body.razorpaySignature ?? "").trim();

  if (!leadId || !orderId || !paymentId || !signature) {
    res.status(400).json({ success: false, message: "Missing payment verification fields." });
    return;
  }

  if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
    res.status(400).json({ success: false, message: "Invalid payment signature." });
    return;
  }

  try {
    await ensureDeveloperLeadsTable();
    const lead = await query(`SELECT * FROM developer_leads WHERE id = $1`, [leadId]);
    if (!lead.rows[0]) {
      res.status(404).json({ success: false, message: "Application not found." });
      return;
    }

    const row = lead.rows[0] as {
      razorpay_order_id: string | null;
      amount_inr: number;
      payment_status: string;
    };

    if (row.razorpay_order_id !== orderId) {
      res.status(400).json({ success: false, message: "Order mismatch." });
      return;
    }

    if (row.payment_status === "paid") {
      res.json({ success: true, message: "Payment already verified." });
      return;
    }

    const payment = await ensureRazorpayPaymentCaptured({
      orderId,
      paymentId,
      amountInr: Number(row.amount_inr),
    });

    await query(
      `UPDATE developer_leads SET
         payment_status = 'paid',
         status = 'paid',
         approval_phase = 'documents',
         razorpay_payment_id = $1,
         payment_method = $2,
         paid_at = NOW()
       WHERE id = $3`,
      [paymentId, payment.method ?? "card", leadId],
    );

    logger.info({ leadId, paymentId, method: payment.method }, "developer lead payment verified");

    res.json({
      success: true,
      message: "Payment verified. Application sent to Videh admin for approval.",
    });
  } catch (err) {
    req.log.error({ err }, "developer payment verify");
    res.status(500).json({ success: false, message: "Payment verification failed." });
  }
});

export default router;
