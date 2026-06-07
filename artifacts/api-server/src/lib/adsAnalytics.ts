import { query } from "./db";
import { ensureReelsAdsTables } from "./reelsAdsSchema";

export type CampaignOverviewRow = {
  id: number;
  name: string;
  status: string;
  objective: string;
  start_date: string;
  end_date: string | null;
  daily_budget_inr: string;
  total_budget_inr: string;
  spent_inr: string;
  bid_model: string;
  bid_amount_inr: string;
  active_creatives: number;
  approved_creatives: number;
  pending_creatives: number;
  impressions: string;
  clicks: string;
  is_running: boolean;
  days_left: number | null;
};

export async function ensureAdsAnalyticsColumns(): Promise<void> {
  await query(`ALTER TABLE reels_ad_campaigns ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE`);
  await query(`ALTER TABLE reels_ad_campaigns ADD COLUMN IF NOT EXISTS end_date DATE`);
  await query(`ALTER TABLE reels_ad_impressions ADD COLUMN IF NOT EXISTS viewer_city VARCHAR(80)`);
  await query(`ALTER TABLE reels_ad_impressions ADD COLUMN IF NOT EXISTS viewer_state VARCHAR(80)`);
  await query(`ALTER TABLE reels_ad_impressions ADD COLUMN IF NOT EXISTS viewer_country VARCHAR(80) DEFAULT 'India'`);
}

function campaignRunningSql(alias = "camp"): string {
  return `(
    ${alias}.status = 'active'
    AND ${alias}.spent_inr < ${alias}.total_budget_inr
    AND ${alias}.start_date <= CURRENT_DATE
    AND (${alias}.end_date IS NULL OR ${alias}.end_date >= CURRENT_DATE)
  )`;
}

export async function getAdvertiserDashboard(advertiserId: number) {
  await ensureReelsAdsTables();
  await ensureAdsAnalyticsColumns();

  const summary = await query(
    `SELECT
       COUNT(DISTINCT camp.id)::int AS total_campaigns,
       COUNT(DISTINCT camp.id) FILTER (WHERE ${campaignRunningSql("camp")})::int AS running_campaigns,
       COALESCE(SUM(camp.spent_inr), 0)::numeric AS total_spent_inr,
       COALESCE(SUM(cr.impressions), 0)::bigint AS impressions,
       COALESCE(SUM(cr.clicks), 0)::bigint AS clicks,
       COALESCE(SUM(cr.completions), 0)::bigint AS completions
     FROM reels_ad_campaigns camp
     LEFT JOIN reels_ad_creatives cr ON cr.campaign_id = camp.id
     WHERE camp.advertiser_id = $1`,
    [advertiserId],
  );

  const campaigns = await query(
    `SELECT camp.id, camp.name, camp.status, COALESCE(camp.objective, 'brand_awareness') AS objective,
            camp.start_date::text, camp.end_date::text,
            camp.daily_budget_inr, camp.total_budget_inr, camp.spent_inr,
            camp.bid_model, camp.bid_amount_inr,
            COUNT(cr.id) FILTER (WHERE cr.is_active)::int AS active_creatives,
            COUNT(cr.id) FILTER (WHERE cr.moderation_status = 'approved')::int AS approved_creatives,
            COUNT(cr.id) FILTER (WHERE cr.moderation_status = 'pending_review')::int AS pending_creatives,
            COALESCE(SUM(cr.impressions), 0)::bigint AS impressions,
            COALESCE(SUM(cr.clicks), 0)::bigint AS clicks,
            (${campaignRunningSql("camp")}) AS is_running,
            CASE WHEN camp.end_date IS NOT NULL
              THEN GREATEST(0, (camp.end_date - CURRENT_DATE))::int
              ELSE NULL END AS days_left
     FROM reels_ad_campaigns camp
     LEFT JOIN reels_ad_creatives cr ON cr.campaign_id = camp.id
     WHERE camp.advertiser_id = $1
     GROUP BY camp.id
     ORDER BY camp.created_at DESC`,
    [advertiserId],
  );

  const byCity = await query(
    `SELECT COALESCE(imp.viewer_city, 'Unknown') AS city,
            COALESCE(imp.viewer_state, 'Unknown') AS state,
            COUNT(*)::bigint AS impressions,
            COUNT(*) FILTER (WHERE imp.clicked)::bigint AS clicks,
            COALESCE(SUM(imp.cost_inr), 0)::numeric AS spend_inr
     FROM reels_ad_impressions imp
     JOIN reels_ad_creatives cr ON cr.id = imp.creative_id
     JOIN reels_ad_campaigns camp ON camp.id = cr.campaign_id
     WHERE camp.advertiser_id = $1
     GROUP BY imp.viewer_city, imp.viewer_state
     ORDER BY impressions DESC
     LIMIT 25`,
    [advertiserId],
  );

  const byDay = await query(
    `SELECT imp.created_at::date::text AS day,
            COUNT(*)::bigint AS impressions,
            COUNT(*) FILTER (WHERE imp.clicked)::bigint AS clicks,
            COALESCE(SUM(imp.cost_inr), 0)::numeric AS spend_inr
     FROM reels_ad_impressions imp
     JOIN reels_ad_creatives cr ON cr.id = imp.creative_id
     JOIN reels_ad_campaigns camp ON camp.id = cr.campaign_id
     WHERE camp.advertiser_id = $1
       AND imp.created_at >= NOW() - INTERVAL '30 days'
     GROUP BY imp.created_at::date
     ORDER BY day DESC`,
    [advertiserId],
  );

  const payments = await query(
    `SELECT COALESCE(SUM(amount_inr), 0)::numeric AS total_paid_inr,
            COUNT(*)::int AS payment_count
     FROM reels_ad_payments WHERE advertiser_id = $1`,
    [advertiserId],
  );

  return {
    summary: summary.rows[0],
    campaigns: campaigns.rows,
    byCity: byCity.rows,
    byDay: byDay.rows,
    payments: payments.rows[0],
  };
}

export async function getAdminAdsPlatformOverview() {
  await ensureReelsAdsTables();
  await ensureAdsAnalyticsColumns();

  const totals = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM reels_advertisers WHERE status = 'active') AS advertisers,
       (SELECT COUNT(*)::int FROM reels_ad_campaigns) AS campaigns,
       (SELECT COUNT(*)::int FROM reels_ad_campaigns camp WHERE ${campaignRunningSql("camp")}) AS running_campaigns,
       (SELECT COUNT(*)::int FROM reels_ad_creatives WHERE moderation_status = 'approved') AS live_ads,
       (SELECT COUNT(*)::int FROM reels_ad_creatives WHERE moderation_status = 'pending_review') AS pending_ads,
       (SELECT COALESCE(SUM(spent_inr), 0)::numeric FROM reels_ad_campaigns) AS ad_spend_inr,
       (SELECT COALESCE(SUM(amount_inr), 0)::numeric FROM reels_ad_payments) AS revenue_inr,
       (SELECT COALESCE(SUM(balance_inr), 0)::numeric FROM reels_advertisers) AS wallet_balance_inr,
       (SELECT COALESCE(SUM(impressions), 0)::bigint FROM reels_ad_creatives) AS total_impressions,
       (SELECT COALESCE(SUM(clicks), 0)::bigint FROM reels_ad_creatives) AS total_clicks`,
  );

  const advertisers = await query(
    `SELECT adv.id, adv.email, adv.company_name, adv.balance_inr, adv.status, adv.created_at,
            COUNT(DISTINCT camp.id)::int AS campaigns,
            COUNT(DISTINCT camp.id) FILTER (WHERE ${campaignRunningSql("camp")})::int AS running_campaigns,
            COALESCE(SUM(camp.spent_inr), 0)::numeric AS spent_inr,
            COALESCE(pay.total_paid, 0)::numeric AS paid_inr
     FROM reels_advertisers adv
     LEFT JOIN reels_ad_campaigns camp ON camp.advertiser_id = adv.id
     LEFT JOIN LATERAL (
       SELECT SUM(amount_inr) AS total_paid FROM reels_ad_payments p WHERE p.advertiser_id = adv.id
     ) pay ON TRUE
     GROUP BY adv.id, pay.total_paid
     ORDER BY paid_inr DESC NULLS LAST, adv.created_at DESC`,
  );

  const runningCampaigns = await query(
    `SELECT camp.id, camp.name, camp.status, camp.start_date::text, camp.end_date::text,
            camp.daily_budget_inr, camp.total_budget_inr, camp.spent_inr, camp.objective,
            adv.company_name, adv.email AS advertiser_email,
            COUNT(cr.id) FILTER (WHERE cr.moderation_status = 'approved')::int AS live_ads,
            COALESCE(SUM(cr.impressions), 0)::bigint AS impressions,
            COALESCE(SUM(cr.clicks), 0)::bigint AS clicks,
            CASE WHEN camp.end_date IS NOT NULL
              THEN GREATEST(0, (camp.end_date - CURRENT_DATE))::int ELSE NULL END AS days_left
     FROM reels_ad_campaigns camp
     JOIN reels_advertisers adv ON adv.id = camp.advertiser_id
     LEFT JOIN reels_ad_creatives cr ON cr.campaign_id = camp.id
     WHERE ${campaignRunningSql("camp")}
     GROUP BY camp.id, adv.company_name, adv.email
     ORDER BY camp.spent_inr DESC`,
  );

  const revenueByDay = await query(
    `SELECT created_at::date::text AS day, SUM(amount_inr)::numeric AS revenue_inr, COUNT(*)::int AS payments
     FROM reels_ad_payments
     WHERE created_at >= NOW() - INTERVAL '60 days'
     GROUP BY created_at::date
     ORDER BY day DESC`,
  );

  const geo = await query(
    `SELECT COALESCE(viewer_city, 'Unknown') AS city,
            COALESCE(viewer_state, 'Unknown') AS state,
            COUNT(*)::bigint AS impressions,
            COUNT(*) FILTER (WHERE clicked)::bigint AS clicks
     FROM reels_ad_impressions
     WHERE created_at >= NOW() - INTERVAL '30 days'
     GROUP BY viewer_city, viewer_state
     ORDER BY impressions DESC
     LIMIT 30`,
  );

  const recentPayments = await query(
    `SELECT p.amount_inr, p.razorpay_payment_id, p.payment_method, p.created_at,
            adv.company_name, adv.email
     FROM reels_ad_payments p
     JOIN reels_advertisers adv ON adv.id = p.advertiser_id
     ORDER BY p.created_at DESC
     LIMIT 40`,
  );

  return {
    totals: totals.rows[0],
    advertisers: advertisers.rows,
    runningCampaigns: runningCampaigns.rows,
    revenueByDay: revenueByDay.rows,
    geo: geo.rows,
    recentPayments: recentPayments.rows,
  };
}
