import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { query } from "../lib/db";
import { logger } from "../lib/logger";
import {
  createRazorpayOrder,
  ensureRazorpayPaymentCaptured,
  getRazorpayConfig,
  verifyRazorpaySignature,
} from "../lib/razorpay";
import {
  CONVERSATION_PRICING_INR,
  FREE_USER_INITIATED_PER_MONTH,
  PAYMENT_VERIFICATION_INR,
  SERVICE_REPLY_FREE_HOURS,
} from "../lib/developerBilling";
import {
  documentsForEntity,
  ensureDeveloperPlatformTables,
  WIZARD_STEPS,
} from "../lib/developerPlatform";
import {
  buildTemplateInsertParams,
  ensureDeveloperTemplateTables,
  templateToPublic,
  type MessageTemplateRow,
  type TemplateSubmitPayload,
} from "../lib/developerTemplates";
import { validateTemplateComponents } from "../lib/templateComponents";
import {
  channelPublicFromRow,
  ensureDeveloperChannelColumns,
  sendChannelOtp,
  verifyChannelOtp,
} from "../lib/developerChannel";
import { getDeveloperPortalUser } from "../lib/developerPortalSession";
import {
  ensureDeveloperPortalUsersTable,
  getActiveLeadForPortalUser,
  linkLeadToPortalUserIfNeeded,
  normalizePortalEmail,
} from "../lib/developerPortalUsers";
import {
  decryptApiSecret,
  ensureApiSecretEncColumn,
  rotateApiSecretForAccount,
} from "../lib/developerApiSecretVault";

const router = Router();

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const ENTITY_TYPES = new Set(["pvt_ltd", "llp", "proprietorship", "partnership", "other"]);

export const DEVELOPER_PLANS = {
  starter: { id: "starter", name: "Starter", amountInr: 2999 },
  growth: { id: "growth", name: "Growth", amountInr: 9999 },
  enterprise: { id: "enterprise", name: "Enterprise", amountInr: 0 },
} as const;

export type DeveloperPlanId = keyof typeof DEVELOPER_PLANS;

export const DEVELOPER_STATUSES = [
  "draft",
  "payment_pending",
  "paid",
  "documents_review",
  "channel_setup",
  "templates_review",
  "approved",
  "suspended",
  "rejected",
] as const;

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const developerUploadsDir = path.join(apiServerDir, "uploads", "developer");
fs.mkdirSync(developerUploadsDir, { recursive: true });

const docUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, developerUploadsDir),
    filename: (req, file, cb) => {
      const leadId = String(req.params.id ?? "0");
      const docType = String(req.body?.docType ?? "file").replace(/[^a-z0-9_]/gi, "");
      const ext = path.extname(file.originalname) || ".bin";
      cb(null, `lead_${leadId}_${docType}_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, developerUploadsDir),
    filename: (req, file, cb) => {
      const leadId = String(req.params.id ?? "0");
      const ext = path.extname(file.originalname) || ".png";
      cb(null, `lead_${leadId}_logo_${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Logo must be an image"));
      return;
    }
    cb(null, true);
  },
});

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
  return `VWA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function razorpayCheckoutLogoUrl(): string {
  const base =
    process.env["DEVELOPER_SITE_URL"]?.trim() ||
    process.env["DEVELOPER_PUBLIC_URL"]?.trim() ||
    "https://developer.videh.co.in";
  return `${base.replace(/\/$/, "")}/videh_icon_foreground.png`;
}

function publicUploadUrl(filePath: string): string {
  const rel = path.relative(path.join(apiServerDir, "uploads"), filePath).replace(/\\/g, "/");
  return `/uploads/${rel}`;
}

export { ensureDeveloperPlatformTables, ensureDeveloperPlatformTables as ensureDeveloperLeadsTable };

router.get("/", async (_req, res) => {
  const { configured, keyId } = getRazorpayConfig();
  await ensureDeveloperPlatformTables();
  res.json({
    success: true,
    service: "Videh Business Messaging API",
    razorpayConfigured: configured,
    razorpayKeyId: configured ? keyId : null,
    plans: Object.values(DEVELOPER_PLANS),
    wizardSteps: WIZARD_STEPS,
    documentTypes: "/api/developer-leads/document-types?entity=pvt_ltd",
    paymentFlow: {
      step: "Payment method verification before API (same as industry standard)",
      verificationAmountInr: PAYMENT_VERIFICATION_INR,
      note: "₹5 card/UPI verification — API blocked until captured. Usage billed per conversation.",
    },
    conversationPricing: CONVERSATION_PRICING_INR,
    freeTier: {
      userInitiatedPerMonth: FREE_USER_INITIATED_PER_MONTH,
      serviceReplyFreeHours: SERVICE_REPLY_FREE_HOURS,
    },
  });
});

router.get("/document-types", (req, res) => {
  const entity = String(req.query.entity ?? "pvt_ltd");
  res.json({ success: true, entity, documents: documentsForEntity(entity) });
});

router.post("/draft", async (req: Request, res: Response) => {
  const portalUser = getDeveloperPortalUser(req);
  if (!portalUser) {
    res.status(401).json({ success: false, message: "Sign in or create a developer account before applying." });
    return;
  }
  const ip = clientKey(req);
  if (rateLimited(ip)) {
    res.status(429).json({ success: false, message: "Too many requests." });
    return;
  }
  const planId = String((req.body as { planId?: string }).planId ?? "starter");
  const plan = DEVELOPER_PLANS[planId in DEVELOPER_PLANS ? (planId as DeveloperPlanId) : "starter"];
  try {
    await ensureDeveloperPlatformTables();
    await ensureDeveloperPortalUsersTable();

    const existing = await getActiveLeadForPortalUser(portalUser.userId);
    if (existing && existing.status !== "approved") {
      res.status(201).json({
        success: true,
        leadId: existing.id,
        reference: existing.reference_code,
        plan,
        resumed: true,
      });
      return;
    }

    const reference = referenceCode();
    const r = await query(
      `INSERT INTO developer_leads
       (reference_code, company_name, entity_type, contact_name, email, phone, status, plan_id, amount_inr,
        wizard_step, approval_phase, source_ip, portal_user_id)
       VALUES ($1, '', 'pvt_ltd', '', $2, '', 'draft', $3, $4, 'plan', 'plan', $5, $6)
       RETURNING id, reference_code`,
      [reference, portalUser.email, plan.id, plan.amountInr, ip, portalUser.userId],
    );
    res.status(201).json({
      success: true,
      leadId: r.rows[0]?.id,
      reference: r.rows[0]?.reference_code,
      plan,
    });
  } catch (err) {
    logger.error({ err }, "developer draft");
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      success: false,
      message: "Could not start application. Please retry in a moment.",
      detail: process.env.NODE_ENV === "production" ? undefined : detail,
    });
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ success: false, message: "Invalid id" });
    return;
  }
  try {
    await ensureDeveloperPlatformTables();
    const lead = await query(`SELECT * FROM developer_leads WHERE id = $1`, [id]);
    if (!lead.rows[0]) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }
    const docs = await query(`SELECT * FROM developer_lead_documents WHERE lead_id = $1 ORDER BY doc_type`, [id]);
    res.json({
      success: true,
      lead: lead.rows[0],
      documents: docs.rows,
      requiredDocuments: documentsForEntity(String(lead.rows[0].entity_type)),
    });
  } catch (err) {
    req.log.error({ err }, "developer lead get");
    res.status(500).json({ success: false, message: "Load failed" });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = req.body as Record<string, unknown>;
  if (!id) {
    res.status(400).json({ success: false, message: "Invalid id" });
    return;
  }

  const entityType = body.entityType != null ? String(body.entityType).trim() : undefined;
  if (entityType && !ENTITY_TYPES.has(entityType)) {
    res.status(400).json({ success: false, message: "Invalid entity type" });
    return;
  }

  try {
    await ensureDeveloperPlatformTables();
    const fields: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let i = 1;

    const setField = (col: string, val: unknown) => {
      if (val === undefined) return;
      fields.push(`${col} = $${i++}`);
      params.push(val);
    };

    setField("company_name", body.companyName != null ? String(body.companyName).trim() : undefined);
    setField("entity_type", entityType);
    setField("contact_name", body.contactName != null ? String(body.contactName).trim() : undefined);
    setField("email", body.email != null ? String(body.email).trim() : undefined);
    setField("phone", body.phone != null ? String(body.phone).trim() : undefined);
    setField("website", body.website != null ? String(body.website).trim() || null : undefined);
    setField("gstin", body.gstin != null ? String(body.gstin).trim().toUpperCase() || null : undefined);
    setField("cin", body.cin != null ? String(body.cin).trim() || null : undefined);
    setField("llpin", body.llpin != null ? String(body.llpin).trim() || null : undefined);
    setField("udyam", body.udyam != null ? String(body.udyam).trim() || null : undefined);
    setField("monthly_volume", body.monthlyVolume != null ? String(body.monthlyVolume) : undefined);
    setField("use_case", body.useCase != null ? String(body.useCase).trim() || null : undefined);
    setField("message", body.message != null ? String(body.message).trim() || null : undefined);
    setField("wizard_step", body.wizardStep != null ? String(body.wizardStep) : undefined);
    setField("display_name", body.displayName != null ? String(body.displayName).trim() : undefined);
    setField("business_category", body.businessCategory != null ? String(body.businessCategory).trim() : undefined);
    setField("business_description", body.businessDescription != null ? String(body.businessDescription).trim() : undefined);
    setField("business_address", body.businessAddress != null ? String(body.businessAddress).trim() : undefined);

    if (body.planId != null) {
      const pid = String(body.planId) as DeveloperPlanId;
      const plan = DEVELOPER_PLANS[pid in DEVELOPER_PLANS ? pid : "starter"];
      setField("plan_id", plan.id);
      setField("amount_inr", plan.amountInr);
    }

    params.push(id);
    const r = await query(
      `UPDATE developer_leads SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      params,
    );
    if (!r.rows[0]) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }
    res.json({ success: true, lead: r.rows[0] });
  } catch (err) {
    req.log.error({ err }, "developer lead patch");
    res.status(500).json({ success: false, message: "Update failed" });
  }
});

router.post("/:id/documents", docUpload.single("file"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const docType = String(req.body?.docType ?? "").trim();
  if (!id || !docType || !req.file) {
    res.status(400).json({ success: false, message: "lead id, docType, and file required" });
    return;
  }
  try {
    await ensureDeveloperPlatformTables();
    const url = publicUploadUrl(req.file.path);
    await query(
      `INSERT INTO developer_lead_documents (lead_id, doc_type, file_name, file_path, mime_type)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (lead_id, doc_type) DO UPDATE SET
         file_name = EXCLUDED.file_name,
         file_path = EXCLUDED.file_path,
         mime_type = EXCLUDED.mime_type,
         uploaded_at = NOW()`,
      [id, docType, req.file.originalname, url, req.file.mimetype],
    );
    res.json({ success: true, docType, url });
  } catch (err) {
    req.log.error({ err }, "developer doc upload");
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});

router.post("/:id/logo", logoUpload.single("logo"), async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id || !req.file) {
    res.status(400).json({ success: false, message: "Logo file required" });
    return;
  }
  try {
    await ensureDeveloperPlatformTables();
    const url = publicUploadUrl(req.file.path);
    await query(`UPDATE developer_leads SET logo_url = $1, updated_at = NOW() WHERE id = $2`, [url, id]);
    res.json({ success: true, logoUrl: url });
  } catch (err) {
    req.log.error({ err }, "developer logo upload");
    res.status(500).json({ success: false, message: "Logo upload failed" });
  }
});

router.post("/:id/start-payment", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ success: false, message: "Invalid id" });
    return;
  }
  try {
    await ensureDeveloperPlatformTables();
    const lead = await query(`SELECT * FROM developer_leads WHERE id = $1`, [id]);
    const row = lead.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }

    const entityType = String(row.entity_type);
    const required = documentsForEntity(entityType).filter((d) => d.required);
    const uploaded = await query(
      `SELECT doc_type FROM developer_lead_documents WHERE lead_id = $1`,
      [id],
    );
    const have = new Set(uploaded.rows.map((r) => String((r as { doc_type: string }).doc_type)));
    const missing = required.filter((d) => !have.has(d.key)).map((d) => d.label);
    if (missing.length > 0) {
      res.status(400).json({ success: false, message: `Missing documents: ${missing.join(", ")}` });
      return;
    }

    if (!String(row.display_name ?? "").trim() || !String(row.logo_url ?? "").trim()) {
      res.status(400).json({ success: false, message: "Complete business profile and logo first." });
      return;
    }

    const planId = String(row.plan_id ?? "starter") as DeveloperPlanId;
    const plan = DEVELOPER_PLANS[planId in DEVELOPER_PLANS ? planId : "starter"];
    const { configured } = getRazorpayConfig();

    if (plan.amountInr === 0 || !configured) {
      await query(
        `UPDATE developer_leads SET status = 'paid', payment_status = 'waived', payment_method_verified = true,
         wizard_step = 'done', approval_phase = 'documents', updated_at = NOW() WHERE id = $1`,
        [id],
      );
      res.json({
        success: true,
        needsPayment: false,
        message: "Application submitted for admin review.",
      });
      return;
    }

    if (row.payment_method_verified === true || row.payment_status === "method_verified") {
      res.json({
        success: true,
        needsPayment: false,
        message: "Payment method already verified. Awaiting admin review.",
      });
      return;
    }

    const reference = String(row.reference_code);
    const order = await createRazorpayOrder({
      amountInr: PAYMENT_VERIFICATION_INR,
      receipt: `${reference.slice(0, 32)}-verify`,
      notes: { leadId: id, planId: plan.id, purpose: "payment_method_verification" },
    });

    await query(
      `UPDATE developer_leads SET status = 'payment_pending', payment_status = 'pending',
       amount_inr = $1, razorpay_order_id = $2, wizard_step = 'payment', updated_at = NOW() WHERE id = $3`,
      [PAYMENT_VERIFICATION_INR, order.id, id],
    );

    res.json({
      success: true,
      needsPayment: true,
      paymentPurpose: "method_verification",
      verificationAmountInr: PAYMENT_VERIFICATION_INR,
      platformPlan: plan,
      checkout: {
        orderId: order.id,
        amountInr: PAYMENT_VERIFICATION_INR,
        keyId: getRazorpayConfig().keyId,
        currency: "INR",
        logoUrl: razorpayCheckoutLogoUrl(),
      },
    });
  } catch (err) {
    req.log.error({ err }, "start payment");
    res.status(500).json({ success: false, message: "Could not start payment" });
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
    res.status(400).json({ success: false, message: "Missing payment fields" });
    return;
  }
  if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
    res.status(400).json({ success: false, message: "Invalid payment signature" });
    return;
  }

  try {
    await ensureDeveloperPlatformTables();
    const lead = await query(`SELECT * FROM developer_leads WHERE id = $1`, [leadId]);
    const row = lead.rows[0] as {
      razorpay_order_id: string | null;
      amount_inr: number;
      payment_status: string;
    } | undefined;
    if (!row) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }
    if (row.razorpay_order_id !== orderId) {
      res.status(400).json({ success: false, message: "Order mismatch" });
      return;
    }

    const verifyAmount = Number(row.amount_inr) || PAYMENT_VERIFICATION_INR;
    const payment = await ensureRazorpayPaymentCaptured({
      orderId,
      paymentId,
      amountInr: verifyAmount,
    });

    await query(
      `UPDATE developer_leads SET
         payment_status = 'method_verified',
         payment_method_verified = true,
         status = 'paid',
         approval_phase = 'documents',
         wizard_step = 'done',
         razorpay_payment_id = $1,
         payment_method = $2,
         paid_at = NOW(),
         updated_at = NOW()
       WHERE id = $3`,
      [paymentId, payment.method ?? "card", leadId],
    );

    await query(
      `INSERT INTO developer_billing_events (account_id, event_type, amount_inr, razorpay_payment_id, status, metadata)
       SELECT a.id, 'payment_method_verification', $2, $3, 'captured', '{"purpose":"method_verification"}'::jsonb
       FROM developer_api_accounts a WHERE a.lead_id = $1`,
      [leadId, verifyAmount, paymentId],
    ).catch(() => null);

    res.json({
      success: true,
      message:
        "Payment method verified. Admin will review documents and profile. API keys only after approval; usage billed per conversation.",
    });
  } catch (err) {
    req.log.error({ err }, "verify payment");
    await query(
      `UPDATE developer_leads SET payment_status = 'failed', updated_at = NOW() WHERE id = $1`,
      [leadId],
    ).catch(() => null);
    res.status(500).json({ success: false, message: "Payment verification failed. API will remain on hold." });
  }
});

/** GET /api/developer-leads/:id/channel */
router.get("/:id/channel", async (req, res) => {
  const leadId = Number(req.params.id);
  if (!leadId) {
    res.status(400).json({ success: false, message: "Invalid id" });
    return;
  }
  try {
    await ensureDeveloperChannelColumns();
    const r = await query(`SELECT * FROM developer_leads WHERE id = $1`, [leadId]);
    if (!r.rows[0]) {
      res.status(404).json({ success: false, message: "Not found" });
      return;
    }
    res.json({ success: true, channel: channelPublicFromRow(r.rows[0] as Record<string, unknown>) });
  } catch (err) {
    logger.error({ err }, "channel get");
    res.status(500).json({ success: false, message: "Could not load channel" });
  }
});

/** POST /api/developer-leads/:id/channel/send-otp */
router.post("/:id/channel/send-otp", async (req, res) => {
  const leadId = Number(req.params.id);
  const body = req.body as { channelPhone?: string };
  if (!leadId) {
    res.status(400).json({ success: false, message: "Invalid id" });
    return;
  }
  try {
    const r = await query(`SELECT phone FROM developer_leads WHERE id = $1`, [leadId]);
    if (!r.rows[0]) {
      res.status(404).json({ success: false, message: "Application not found" });
      return;
    }
    const channelPhone = String(body.channelPhone ?? "").trim();
    if (!channelPhone) {
      res.status(400).json({ success: false, message: "channelPhone required" });
      return;
    }
    const contactPhone = String((r.rows[0] as { phone?: string }).phone ?? "").replace(/\D/g, "");
    const channelDigits = channelPhone.replace(/\D/g, "").slice(-10);
    if (contactPhone.endsWith(channelDigits) && contactPhone.length >= 10) {
      res.status(400).json({
        success: false,
        message: "Use a dedicated business number not already used as your signatory contact phone.",
      });
      return;
    }
    const result = await sendChannelOtp(leadId, channelPhone);
    res.json({
      success: true,
      message: "OTP sent to your dedicated channel number.",
      phone: result.phone,
      devOtp: result.devOtp,
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e instanceof Error ? e.message : "OTP send failed" });
  }
});

/** POST /api/developer-leads/:id/channel/verify-otp */
router.post("/:id/channel/verify-otp", async (req, res) => {
  const leadId = Number(req.params.id);
  const body = req.body as { channelPhone?: string; otp?: string };
  if (!leadId || !body.otp) {
    res.status(400).json({ success: false, message: "lead id, channelPhone, and otp required" });
    return;
  }
  try {
    const result = await verifyChannelOtp(leadId, String(body.channelPhone ?? ""), String(body.otp));
    await query(`UPDATE developer_leads SET wizard_step = 'payment', updated_at = NOW() WHERE id = $1`, [leadId]);
    res.json({
      success: true,
      message: "Phone number verified. Your channel IDs are ready.",
      channel: {
        channel_phone: result.phone,
        phone_number_id: result.videh_phone_number_id,
        business_account_id: result.videh_business_account_id,
        channel_status: "verified",
      },
    });
  } catch (e) {
    res.status(400).json({ success: false, message: e instanceof Error ? e.message : "Verification failed" });
  }
});

async function assertPortalLeadAccess(
  leadId: number,
  lead: { reference_code?: string; portal_user_id?: number | null; email?: string },
  reference: string,
  req: Request,
): Promise<boolean> {
  const portalUser = getDeveloperPortalUser(req);
  if (portalUser) {
    await linkLeadToPortalUserIfNeeded(leadId, portalUser.userId, portalUser.email);
    if (lead.portal_user_id === portalUser.userId) return true;
    const leadEmail = normalizePortalEmail(String(lead.email ?? ""));
    if (leadEmail && leadEmail === normalizePortalEmail(portalUser.email)) return true;
  }
  return Boolean(reference && lead.reference_code && lead.reference_code === reference);
}

/** GET /api/developer-leads/:id/portal?reference=DEV-xxx — application status + API key id when approved */
router.get("/:id/portal", async (req, res) => {
  const leadId = Number(req.params.id);
  const reference = String(req.query.reference ?? "").trim();
  if (!leadId) {
    res.status(400).json({ success: false, message: "Invalid lead id" });
    return;
  }
  if (!reference && !getDeveloperPortalUser(req)) {
    res.status(400).json({ success: false, message: "Sign in or provide reference code" });
    return;
  }
  try {
    await ensureDeveloperPlatformTables();
    const lead = await query(`SELECT * FROM developer_leads WHERE id = $1`, [leadId]);
    const row = lead.rows[0] as { reference_code?: string } | undefined;
    if (
      !row ||
      !(await assertPortalLeadAccess(
        leadId,
        row as { reference_code?: string; portal_user_id?: number | null; email?: string },
        reference,
        req,
      ))
    ) {
      res.status(404).json({ success: false, message: "Application not found" });
      return;
    }
    const account = await query(`SELECT * FROM developer_api_accounts WHERE lead_id = $1`, [leadId]);
    const acct = account.rows[0] as Record<string, unknown> | undefined;
    res.json({
      success: true,
      lead: {
        id: leadId,
        reference_code: row.reference_code,
        status: (row as { status?: string }).status,
        approval_phase: (row as { approval_phase?: string }).approval_phase,
        wizard_step: (row as { wizard_step?: string }).wizard_step,
        company_name: (row as { company_name?: string }).company_name,
        plan_id: (row as { plan_id?: string }).plan_id,
        payment_status: (row as { payment_status?: string }).payment_status,
        payment_method_verified: (row as { payment_method_verified?: boolean }).payment_method_verified,
      },
      account: acct
        ? {
            api_key_id: acct.api_key_id,
            billing_status: acct.billing_status,
            plan_id: acct.plan_id,
            amount_inr_monthly: acct.amount_inr_monthly,
            messages_sent_total: acct.messages_sent_total,
            messages_sent_month: acct.messages_sent_month,
            total_billed_inr: acct.total_billed_inr,
            usage_billing_month_inr: acct.usage_billing_month_inr,
            conv_user_initiated_month: acct.conv_user_initiated_month,
            conv_business_marketing_month: acct.conv_business_marketing_month,
            conv_business_utility_month: acct.conv_business_utility_month,
            conv_free_user_used_month: acct.conv_free_user_used_month,
            last_payment_at: acct.last_payment_at,
            videh_phone_number_id: (acct as { videh_phone_number_id?: string }).videh_phone_number_id,
            videh_business_account_id: (acct as { videh_business_account_id?: string }).videh_business_account_id,
          }
        : null,
      channel: channelPublicFromRow(row as Record<string, unknown>),
      apiBaseUrl: "/v1",
      credentials_hint: acct
        ? {
            phone_number_id: (acct as { videh_phone_number_id?: string }).videh_phone_number_id,
            business_account_id: (acct as { videh_business_account_id?: string }).videh_business_account_id,
          }
        : channelPublicFromRow(row as Record<string, unknown>),
    });
  } catch (err) {
    logger.error({ err }, "developer portal");
    res.status(500).json({ success: false, message: "Could not load portal" });
  }
});

/** GET /api/developer-leads/:id/templates?reference= — approved templates for integrators */
router.get("/:id/templates", async (req, res) => {
  const leadId = Number(req.params.id);
  const reference = String(req.query.reference ?? "").trim();
  if (!leadId) {
    res.status(400).json({ success: false, message: "Invalid lead id" });
    return;
  }
  if (!reference && !getDeveloperPortalUser(req)) {
    res.status(400).json({ success: false, message: "Sign in or provide reference code" });
    return;
  }
  try {
    await ensureDeveloperTemplateTables();
    const lead = await query(
      `SELECT reference_code, status, portal_user_id FROM developer_leads WHERE id = $1`,
      [leadId],
    );
    const row = lead.rows[0] as
      | { reference_code?: string; status?: string; portal_user_id?: number | null; email?: string }
      | undefined;
    if (!row || !(await assertPortalLeadAccess(leadId, row, reference, req))) {
      res.status(404).json({ success: false, message: "Application not found" });
      return;
    }

    const r = await query(
      `SELECT * FROM developer_message_templates WHERE lead_id = $1 ORDER BY template_key`,
      [leadId],
    );
    const templates = (r.rows as MessageTemplateRow[]).map((t) => ({
      ...templateToPublic(t),
      approved: t.status === "approved",
      rejection_reason: t.rejection_reason,
      submitted_at: t.submitted_at,
    }));
    res.json({ success: true, templates, approvedCount: templates.filter((t) => t.approved).length });
  } catch (err) {
    logger.error({ err }, "developer portal templates");
    res.status(500).json({ success: false, message: "Could not load templates" });
  }
});

/** POST /api/developer-leads/:id/templates — developer submits template for admin approval */
router.post("/:id/templates", async (req, res) => {
  const leadId = Number(req.params.id);
  const body = req.body as TemplateSubmitPayload & { reference?: string };
  const reference = String(body.reference ?? req.query.reference ?? "").trim();
  if (!leadId) {
    res.status(400).json({ success: false, message: "Invalid lead id" });
    return;
  }
  if (!reference && !getDeveloperPortalUser(req)) {
    res.status(400).json({ success: false, message: "Sign in or provide reference code" });
    return;
  }
  if (!body.templateKey?.trim() || !body.bodyText?.trim()) {
    res.status(400).json({ success: false, message: "templateKey and bodyText required" });
    return;
  }
  const componentCheck = validateTemplateComponents({
    headerFormat: body.headerFormat,
    headerText: body.headerText,
    headerMediaUrl: body.headerMediaUrl,
    bodyText: body.bodyText,
    footerText: body.footerText,
    buttons: body.buttons,
  });
  if (!componentCheck.ok) {
    res.status(400).json({ success: false, message: componentCheck.message });
    return;
  }
  const category = body.category ?? "utility";
  const allowed = new Set(["marketing", "utility", "authentication", "service"]);
  if (!allowed.has(category)) {
    res.status(400).json({ success: false, message: "Invalid category" });
    return;
  }
  try {
    await ensureDeveloperTemplateTables();
    const lead = await query(
      `SELECT reference_code, status, portal_user_id FROM developer_leads WHERE id = $1`,
      [leadId],
    );
    const row = lead.rows[0] as
      | { reference_code?: string; status?: string; portal_user_id?: number | null; email?: string }
      | undefined;
    if (!row || !(await assertPortalLeadAccess(leadId, row, reference, req))) {
      res.status(404).json({ success: false, message: "Application not found" });
      return;
    }
    if (row.status === "rejected") {
      res.status(400).json({ success: false, message: "Application was rejected. Contact support." });
      return;
    }

    const account = await query(`SELECT id FROM developer_api_accounts WHERE lead_id = $1`, [leadId]);
    const accountId = (account.rows[0] as { id?: number } | undefined)?.id ?? null;
    const built = buildTemplateInsertParams(leadId, accountId, body);

    const existing = await query(
      `SELECT id, status FROM developer_message_templates WHERE lead_id = $1 AND template_key = $2`,
      [leadId, built.key],
    );
    const prev = existing.rows[0] as { id?: number; status?: string } | undefined;
    if (prev?.status === "approved") {
      res.status(400).json({ success: false, message: "Approved templates cannot be edited. Create a new template_key." });
      return;
    }
    if (prev?.status === "pending") {
      res.status(400).json({ success: false, message: "This template is already pending review." });
      return;
    }

    const r = await query(
      `INSERT INTO developer_message_templates
       (lead_id, account_id, template_key, name, category, language, header_type, header_text, header_media_url,
        body_text, body_preview, variables_json, variable_samples_json, footer_text, buttons_json, status, rejection_reason, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'pending',NULL,NOW())
       ON CONFLICT (lead_id, template_key) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         language = EXCLUDED.language,
         header_type = EXCLUDED.header_type,
         header_text = EXCLUDED.header_text,
         header_media_url = EXCLUDED.header_media_url,
         body_text = EXCLUDED.body_text,
         body_preview = EXCLUDED.body_preview,
         variables_json = EXCLUDED.variables_json,
         variable_samples_json = EXCLUDED.variable_samples_json,
         footer_text = EXCLUDED.footer_text,
         buttons_json = EXCLUDED.buttons_json,
         account_id = COALESCE(EXCLUDED.account_id, developer_message_templates.account_id),
         status = 'pending',
         rejection_reason = NULL,
         submitted_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [...built.values],
    );
    const tpl = r.rows[0] as MessageTemplateRow;
    res.json({ success: true, template: { ...templateToPublic(tpl), status: tpl.status } });
  } catch (err) {
    logger.error({ err }, "developer submit template");
    res.status(500).json({ success: false, message: "Could not submit template" });
  }
});

type PortalAccountRow = {
  id: number;
  api_key_id: string;
  billing_status: string;
  api_key_secret_enc?: string | null;
};

async function getPortalAccountForLead(
  leadId: number,
  reference: string,
  req: Request,
): Promise<{ lead: { status?: string }; account: PortalAccountRow | null } | null> {
  await ensureDeveloperPlatformTables();
  await ensureApiSecretEncColumn();
  const lead = await query(
    `SELECT id, reference_code, portal_user_id, status FROM developer_leads WHERE id = $1`,
    [leadId],
  );
  const row = lead.rows[0] as
    | { reference_code?: string; portal_user_id?: number | null; status?: string }
    | undefined;
  if (!row || !(await assertPortalLeadAccess(leadId, row, reference, req))) return null;
  const account = await query(
    `SELECT id, api_key_id, billing_status, api_key_secret_enc FROM developer_api_accounts WHERE lead_id = $1`,
    [leadId],
  );
  const acct = account.rows[0] as PortalAccountRow | undefined;
  if (!acct) return { lead: row, account: null };
  return { lead: row, account: acct };
}

/** GET /api/developer-leads/:id/credentials/secret — reveal API secret (portal owner only) */
router.get("/:id/credentials/secret", async (req, res) => {
  const leadId = Number(req.params.id);
  const reference = String(req.query.reference ?? "").trim();
  if (!leadId) {
    res.status(400).json({ success: false, message: "Invalid lead id" });
    return;
  }
  if (!reference && !getDeveloperPortalUser(req)) {
    res.status(401).json({ success: false, message: "Sign in required" });
    return;
  }
  try {
    const ctx = await getPortalAccountForLead(leadId, reference, req);
    if (!ctx) {
      res.status(404).json({ success: false, message: "Application not found" });
      return;
    }
    if (!ctx.account) {
      res.status(404).json({ success: false, message: "API account not active yet" });
      return;
    }
    const plain = decryptApiSecret(ctx.account.api_key_secret_enc);
    if (!plain) {
      res.json({
        success: true,
        hasStoredSecret: false,
        message:
          "No viewable secret on file (older accounts). Click Reset secret to generate a new one you can show or hide anytime.",
      });
      return;
    }
    res.json({ success: true, hasStoredSecret: true, apiSecret: plain });
  } catch (err) {
    logger.error({ err }, "developer credentials secret");
    res.status(500).json({ success: false, message: "Could not load API secret" });
  }
});

/** POST /api/developer-leads/:id/credentials/rotate — rotate API secret */
router.post("/:id/credentials/rotate", async (req, res) => {
  const leadId = Number(req.params.id);
  const body = req.body as { reference?: string };
  const reference = String(body.reference ?? req.query.reference ?? "").trim();
  if (!leadId) {
    res.status(400).json({ success: false, message: "Invalid lead id" });
    return;
  }
  if (!reference && !getDeveloperPortalUser(req)) {
    res.status(401).json({ success: false, message: "Sign in required" });
    return;
  }
  try {
    const ctx = await getPortalAccountForLead(leadId, reference, req);
    if (!ctx) {
      res.status(404).json({ success: false, message: "Application not found" });
      return;
    }
    if (!ctx.account) {
      res.status(404).json({ success: false, message: "API account not active yet" });
      return;
    }
    if (ctx.account.billing_status === "suspended") {
      res.status(403).json({ success: false, message: "API access is suspended. Contact developer@videh.co.in" });
      return;
    }
    const apiSecret = await rotateApiSecretForAccount(ctx.account.id);
    res.json({
      success: true,
      apiSecret,
      message: "API secret rotated. Update your servers immediately; the old secret no longer works.",
    });
  } catch (err) {
    logger.error({ err }, "developer credentials rotate");
    const msg = err instanceof Error ? err.message : "Could not rotate API secret";
    res.status(500).json({ success: false, message: msg });
  }
});

export default router;
