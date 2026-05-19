import { Router, type Request, type Response } from "express";
import { query } from "../lib/db";
import { logger } from "../lib/logger";

const router = Router();

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60 * 60 * 1000;

const ENTITY_TYPES = new Set(["pvt_ltd", "llp", "proprietorship", "partnership", "other"]);

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

async function ensureDeveloperLeadsTable(): Promise<void> {
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
      status TEXT NOT NULL DEFAULT 'new',
      source_ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

router.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "Videh Business Messaging API — Developer leads",
    apply: "POST /api/developer-leads",
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
    await query(
      `INSERT INTO developer_leads
       (reference_code, company_name, entity_type, contact_name, email, phone,
        website, gstin, monthly_volume, use_case, message, source_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
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
        ip,
      ],
    );

    logger.info({ reference, companyName, entityType, email }, "developer lead submitted");

    res.status(201).json({
      success: true,
      reference,
      message: "Application received. Our team will contact you within 1–2 business days.",
    });
  } catch (err) {
    req.log.error({ err }, "developer lead insert");
    res.status(500).json({ success: false, message: "Could not save application. Try again later." });
  }
});

export default router;
