import { query } from "./db";

/** India conversation rates (INR, per 24h conversation window). */
export const CONVERSATION_PRICING_INR = {
  user_initiated: { min: 0.35, max: 0.58, label: "User-initiated", note: "Customer messages you first" },
  business_initiated: {
    marketing: { rate: 0.78, label: "Marketing", note: "Promotions & offers" },
    utility: { rate: 0.35, label: "Utility", note: "Order updates, alerts" },
    authentication: { rate: 0.35, label: "Authentication", note: "OTP & verification" },
    service: { rate: 0.35, label: "Service", note: "Replies within 24h window" },
  },
} as const;

export const FREE_USER_INITIATED_PER_MONTH = 100;
export const SERVICE_REPLY_FREE_HOURS = 24;
export const PAYMENT_VERIFICATION_INR = 5;

export type ConversationCategory = "marketing" | "utility" | "authentication" | "service";
export type ConversationInitiator = "user" | "business";

export type BillConversationInput = {
  accountId: number;
  initiator: ConversationInitiator;
  category?: ConversationCategory;
  withinServiceWindow?: boolean;
};

export type BillConversationResult = {
  charged: boolean;
  amountInr: number;
  reason: string;
};

function rateFor(initiator: ConversationInitiator, category?: ConversationCategory): number {
  if (initiator === "user") {
    return CONVERSATION_PRICING_INR.user_initiated.min;
  }
  const cat = category ?? "utility";
  return CONVERSATION_PRICING_INR.business_initiated[cat].rate;
}

/** Bill one conversation; returns amount (0 if free tier / service window). */
export async function billConversation(input: BillConversationInput): Promise<BillConversationResult> {
  const { accountId, initiator, category, withinServiceWindow } = input;

  if (initiator === "business" && withinServiceWindow) {
    return { charged: false, amountInr: 0, reason: "free_service_window_24h" };
  }

  if (initiator === "user") {
    const free = await query(
      `SELECT conv_free_user_used_month FROM developer_api_accounts WHERE id = $1`,
      [accountId],
    );
    const used = Number((free.rows[0] as { conv_free_user_used_month?: number })?.conv_free_user_used_month ?? 0);
    if (used < FREE_USER_INITIATED_PER_MONTH) {
      await query(
        `UPDATE developer_api_accounts SET
           conv_free_user_used_month = conv_free_user_used_month + 1,
           conv_user_initiated_month = conv_user_initiated_month + 1,
           messages_sent_month = messages_sent_month + 1,
           messages_sent_total = messages_sent_total + 1
         WHERE id = $1`,
        [accountId],
      );
      return { charged: false, amountInr: 0, reason: "free_tier_user_initiated" };
    }
  }

  const amount = rateFor(initiator, category);
  const amountPaise = Math.round(amount * 100);

  const col =
    initiator === "user"
      ? "conv_user_initiated_month"
      : category === "marketing"
        ? "conv_business_marketing_month"
        : category === "authentication"
          ? "conv_business_auth_month"
          : category === "service"
            ? "conv_business_service_month"
            : "conv_business_utility_month";

  await query(
    `UPDATE developer_api_accounts SET
       ${col} = ${col} + 1,
       usage_billing_month_inr = usage_billing_month_inr + $2,
       messages_sent_month = messages_sent_month + 1,
       messages_sent_total = messages_sent_total + 1
     WHERE id = $1`,
    [accountId, amountPaise],
  );

  await query(
    `INSERT INTO developer_conversations (account_id, initiator, category, amount_inr, billed)
     VALUES ($1, $2, $3, $4, true)`,
    [accountId, initiator, category ?? null, amountPaise],
  );

  return { charged: true, amountInr: amount, reason: "conversation_billed" };
}

export async function assertApiBillingActive(accountId: number): Promise<{ ok: boolean; reason?: string }> {
  const r = await query(
    `SELECT a.billing_status, l.payment_status, l.payment_method_verified
     FROM developer_api_accounts a
     JOIN developer_leads l ON l.id = a.lead_id
     WHERE a.id = $1`,
    [accountId],
  );
  const row = r.rows[0] as {
    billing_status?: string;
    payment_status?: string;
    payment_method_verified?: boolean;
  } | undefined;
  if (!row) return { ok: false, reason: "account_not_found" };
  if (row.billing_status === "hold" || row.billing_status === "past_due") {
    return { ok: false, reason: "billing_on_hold" };
  }
  if (
    !row.payment_method_verified &&
    row.payment_status !== "method_verified" &&
    row.payment_status !== "paid" &&
    row.payment_status !== "waived"
  ) {
    return { ok: false, reason: "payment_method_not_verified" };
  }
  return { ok: true };
}
