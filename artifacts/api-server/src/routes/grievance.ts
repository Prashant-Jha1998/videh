import { Router, type Request, type Response } from "express";
import { ensureAdminPlatformTables, grievanceTicketNumber, grievanceSlaTimestamps } from "../lib/adminPlatform";
import { query } from "../lib/db";
import { logger } from "../lib/logger";

const router = Router();

const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;

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
  if (row.count > RATE_LIMIT) return true;
  return false;
}

router.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "Videh Grievance Officer",
    slaHoursAck: 36,
    slaDaysResolve: 15,
    fields: ["complainantName", "email", "phone", "category", "description"],
  });
});

router.post("/", async (req, res) => {
  const ip = clientKey(req);
  if (rateLimited(ip)) {
    res.status(429).json({ success: false, message: "Too many requests. Try again later." });
    return;
  }

  const body = req.body as {
    complainantName?: string;
    email?: string;
    phone?: string;
    category?: string;
    description?: string;
  };

  const name = String(body.complainantName ?? "").trim();
  const description = String(body.description ?? "").trim();
  const email = String(body.email ?? "").trim() || null;
  const phone = String(body.phone ?? "").trim() || null;
  const category = String(body.category ?? "it_rules_grievance").trim() || "it_rules_grievance";

  if (name.length < 2 || description.length < 20) {
    res.status(400).json({
      success: false,
      message: "Provide complainantName and description (minimum 20 characters).",
    });
    return;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "Invalid email address." });
    return;
  }

  try {
    await ensureAdminPlatformTables();
    const sla = grievanceSlaTimestamps();
    const ticket = grievanceTicketNumber();
    await query(
      `INSERT INTO grievance_tickets
       (ticket_number, complainant_name, email, phone, category, description, priority,
        sla_ack_due_at, sla_resolve_due_at, submitted_via, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'normal', $7, $8, 'public_web', 'open')`,
      [ticket, name, email, phone, category, description, sla.ackDue.toISOString(), sla.resolveDue.toISOString()],
    );
    res.status(201).json({
      success: true,
      ticketNumber: ticket,
      message:
        "Your grievance has been registered. Our Grievance Officer will acknowledge within 36 hours as per IT Rules.",
    });
  } catch (err) {
    logger.error({ err }, "public grievance submit");
    res.status(500).json({ success: false, message: "Could not register grievance. Please try again later." });
  }
});

export default router;
