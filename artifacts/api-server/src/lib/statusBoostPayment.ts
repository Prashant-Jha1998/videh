import crypto from "node:crypto";
import { query } from "./db";

export const BOOST_BASE_PRICE_INR = 499;
export const BOOST_DAY_PRICE_INR = 299;
export const BOOST_RADIUS_PRICE_INR = 12;
export const BOOST_CITY_PRICE_INR = 350;
export const BOOST_STATE_PRICE_INR = 700;
export const BOOST_MIN_DAYS = 1;
export const BOOST_MAX_DAYS = 30;
export const BOOST_MIN_RADIUS_KM = 5;
export const BOOST_MAX_RADIUS_KM = 500;

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

export type BoostPlan = {
  amountInr: number;
  durationDays: number;
  radiusKm: number;
  targetCity: string | null;
  targetState: string | null;
  estimatedReach: number;
};

export function calculateBoostPlan(input: {
  durationDays: unknown;
  radiusKm: unknown;
  targetCity?: unknown;
  targetState?: unknown;
}): BoostPlan {
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
  const estimatedReach = Math.round(
    1200 + durationDays * 1800 + radiusKm * 95 + (targetCity ? 2500 : 0) + (targetState ? 5000 : 0),
  );
  return { amountInr, durationDays, radiusKm, targetCity, targetState, estimatedReach };
}

export function getRazorpayConfig() {
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

export async function createRazorpayOrder(args: {
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

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const { keySecret, configured } = getRazorpayConfig();
  if (!configured) return false;
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
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
    body: JSON.stringify({ amount: expectedAmount, currency: "INR" }),
  });

  if (payment.status !== "captured" && !payment.captured) {
    throw new Error(`Payment capture failed. Current status: ${payment.status}.`);
  }
  return payment;
}

let boostTablesEnsured = false;
export async function ensureBoostTables(): Promise<void> {
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
  boostTablesEnsured = true;
}

export async function createBoostOrderForStatus(statusId: number, userId: number, planInput: {
  durationDays: unknown;
  radiusKm: unknown;
  targetCity?: unknown;
  targetState?: unknown;
}) {
  await ensureBoostTables();
  const owner = await query(
    "SELECT id FROM statuses WHERE id = $1 AND user_id = $2 AND expires_at > NOW()",
    [statusId, userId],
  );
  if (owner.rows.length === 0) throw new Error("Active status not found.");

  const plan = calculateBoostPlan(planInput);
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

  return { plan, order, keyId: getRazorpayConfig().keyId };
}

export async function confirmBoostPaymentForStatus(
  statusId: number,
  userId: number,
  args: {
    amountInr: number;
    durationDays: number;
    radiusKm: number;
    targetCity?: string;
    targetState?: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  },
) {
  const plan = calculateBoostPlan({
    durationDays: args.durationDays,
    radiusKm: args.radiusKm,
    targetCity: args.targetCity,
    targetState: args.targetState,
  });

  if (Number(args.amountInr) !== plan.amountInr) throw new Error("Invalid payment or boost plan.");
  if (!verifyRazorpaySignature(args.razorpayOrderId, args.razorpayPaymentId, args.razorpaySignature)) {
    throw new Error("Payment signature verification failed.");
  }

  await ensureBoostTables();
  const owner = await query(
    "SELECT id FROM statuses WHERE id = $1 AND user_id = $2 AND expires_at > NOW()",
    [statusId, userId],
  );
  if (owner.rows.length === 0) throw new Error("Active status not found.");

  await ensureRazorpayPaymentCaptured({
    orderId: args.razorpayOrderId,
    paymentId: args.razorpayPaymentId,
    amountInr: plan.amountInr,
  });

  const result = await query(
    `INSERT INTO status_boosts (
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
    RETURNING *`,
    [
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
      args.razorpayPaymentId.trim(),
    ],
  );

  await query(
    `UPDATE statuses
     SET expires_at = GREATEST(expires_at, NOW() + INTERVAL '24 hours')
     WHERE id = $1 AND user_id = $2`,
    [statusId, userId],
  );

  return { boost: result.rows[0], plan };
}

export async function getLatestBoostForStatus(statusId: number, userId: number) {
  await ensureBoostTables();
  const result = await query(
    `SELECT * FROM status_boosts WHERE status_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [statusId, userId],
  );
  return result.rows[0] ?? null;
}

export async function getBoostAnalytics(statusId: number, userId: number) {
  await ensureBoostTables();
  const boost = await getLatestBoostForStatus(statusId, userId);
  if (!boost) return null;

  const startAt = boost.starts_at ?? boost.verified_at ?? boost.created_at;
  const viewers = await query(
    `SELECT u.id, u.name, sv.viewed_at
     FROM status_views sv
     JOIN users u ON u.id = sv.viewer_id
     WHERE sv.status_id = $1 AND sv.viewed_at >= $2
     ORDER BY sv.viewed_at DESC
     LIMIT 500`,
    [statusId, startAt],
  );

  return {
    boost,
    boostedViewCount: viewers.rows.length,
    viewers: viewers.rows.map((v: { id: number; name: string; viewed_at: string }) => ({
      id: v.id,
      name: v.name ?? "Videh user",
      viewedAt: v.viewed_at,
    })),
  };
}
