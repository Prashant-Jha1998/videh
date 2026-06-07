import { query } from "./db";
import {
  createRazorpayOrder,
  ensureRazorpayPaymentCaptured,
  getRazorpayConfig,
  verifyRazorpaySignature,
} from "./razorpay";
import { ensureReelsAdsTables, ensureReelsAdsPaymentTables } from "./reelsAdsSchema";
import { topUpAdvertiserBalance } from "./reelsAds";

const DEMO_EMAIL = (process.env.ADS_DEMO_EMAIL ?? "pjhawithu@gmail.com").trim().toLowerCase();

export function isAdsDemoEmail(email: string): boolean {
  return email.trim().toLowerCase() === DEMO_EMAIL;
}

export function adsCheckoutLogoUrl(): string {
  const base = process.env.ADS_SITE_URL?.trim() || "https://ads.videh.co.in";
  return `${base.replace(/\/$/, "")}/videh_icon_foreground.png`;
}

export async function getAdvertiserBalance(advertiserId: number): Promise<number> {
  await ensureReelsAdsTables();
  const r = await query(`SELECT balance_inr FROM reels_advertisers WHERE id = $1`, [advertiserId]);
  return Number(r.rows[0]?.balance_inr) || 0;
}

export async function createAdsWalletOrder(advertiserId: number, amountInr: number) {
  await ensureReelsAdsPaymentTables();
  const { configured, keyId } = getRazorpayConfig();
  if (!configured) throw new Error("Payment gateway is not configured. Contact support@videh.co.in.");

  const amount = Math.round(amountInr * 100) / 100;
  const receipt = `ads_${advertiserId}_${Date.now()}`;
  const order = await createRazorpayOrder({
    amountInr: amount,
    receipt,
    notes: { advertiser_id: advertiserId, product: "videh_ads_wallet" },
  });

  const ins = await query(
    `INSERT INTO reels_ad_topup_orders (advertiser_id, amount_inr, razorpay_order_id, status)
     VALUES ($1, $2, $3, 'created') RETURNING id`,
    [advertiserId, amount, order.id],
  );

  return {
    orderId: order.id,
    localOrderId: Number(ins.rows[0]?.id),
    amountInr: amount,
    keyId,
    currency: "INR",
    logoUrl: adsCheckoutLogoUrl(),
  };
}

export async function verifyAdsWalletPayment(opts: {
  advertiserId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ balanceInr: number }> {
  await ensureReelsAdsPaymentTables();

  const orderId = opts.razorpayOrderId.trim();
  const paymentId = opts.razorpayPaymentId.trim();
  const signature = opts.razorpaySignature.trim();
  if (!orderId || !paymentId || !signature) throw new Error("Incomplete payment response.");

  if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
    throw new Error("Payment verification failed.");
  }

  const row = await query(
    `SELECT id, advertiser_id, amount_inr, status FROM reels_ad_topup_orders
     WHERE razorpay_order_id = $1 AND advertiser_id = $2 LIMIT 1`,
    [orderId, opts.advertiserId],
  );
  const order = row.rows[0] as {
    id: number;
    advertiser_id: number;
    amount_inr: string;
    status: string;
  } | undefined;
  if (!order) throw new Error("Order not found.");
  if (order.status === "paid") {
    const bal = await getAdvertiserBalance(opts.advertiserId);
    return { balanceInr: bal };
  }

  const amountInr = Number(order.amount_inr);
  const payment = await ensureRazorpayPaymentCaptured({
    orderId,
    paymentId,
    amountInr,
  });

  const dup = await query(
    `SELECT id FROM reels_ad_payments WHERE razorpay_payment_id = $1`,
    [paymentId],
  );
  if (dup.rows.length) {
    const bal = await getAdvertiserBalance(opts.advertiserId);
    return { balanceInr: bal };
  }

  await query(
    `INSERT INTO reels_ad_payments
      (advertiser_id, order_id, amount_inr, razorpay_order_id, razorpay_payment_id, payment_method, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'captured')`,
    [
      opts.advertiserId,
      order.id,
      amountInr,
      orderId,
      paymentId,
      payment.method ?? null,
    ],
  );
  await query(
    `UPDATE reels_ad_topup_orders SET status = 'paid', paid_at = NOW() WHERE id = $1`,
    [order.id],
  );
  await topUpAdvertiserBalance(opts.advertiserId, amountInr);

  const bal = await getAdvertiserBalance(opts.advertiserId);
  return { balanceInr: bal };
}

export async function listAdsPayments(advertiserId: number, limit = 20) {
  await ensureReelsAdsPaymentTables();
  const r = await query(
    `SELECT amount_inr, razorpay_payment_id, payment_method, status, created_at
     FROM reels_ad_payments WHERE advertiser_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [advertiserId, limit],
  );
  return r.rows;
}
