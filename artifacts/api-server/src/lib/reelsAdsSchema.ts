import { query } from "./db";

let adsEnsured = false;

export async function ensureReelsAdsTables(): Promise<void> {
  if (adsEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS reels_advertisers (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      company_name VARCHAR(120) NOT NULL,
      contact_name VARCHAR(80),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      balance_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  try {
    await query(`ALTER TABLE reels_advertisers ADD COLUMN IF NOT EXISTS google_sub TEXT`);
    await query(`ALTER TABLE reels_advertisers ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'password'`);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_advertisers_google_sub
        ON reels_advertisers (google_sub) WHERE google_sub IS NOT NULL
    `);
  } catch {
    /* ignore */
  }
  await query(`
    CREATE TABLE IF NOT EXISTS reels_ad_campaigns (
      id SERIAL PRIMARY KEY,
      advertiser_id INTEGER NOT NULL REFERENCES reels_advertisers(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      daily_budget_inr NUMERIC(12, 2) NOT NULL DEFAULT 500,
      total_budget_inr NUMERIC(12, 2) NOT NULL DEFAULT 5000,
      spent_inr NUMERIC(12, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_ad_creatives (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES reels_ad_campaigns(id) ON DELETE CASCADE,
      title VARCHAR(120) NOT NULL,
      video_url TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 30,
      skip_after_seconds INTEGER,
      placement VARCHAR(16) NOT NULL DEFAULT 'any',
      ad_type VARCHAR(20) NOT NULL DEFAULT 'non_skippable',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      impressions BIGINT NOT NULL DEFAULT 0,
      completions BIGINT NOT NULL DEFAULT 0,
      skips BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_ad_impressions (
      id SERIAL PRIMARY KEY,
      creative_id INTEGER NOT NULL REFERENCES reels_ad_creatives(id) ON DELETE CASCADE,
      content_video_id INTEGER REFERENCES reels_videos(id) ON DELETE SET NULL,
      viewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      placement VARCHAR(16) NOT NULL,
      watched_seconds INTEGER NOT NULL DEFAULT 0,
      skipped BOOLEAN NOT NULL DEFAULT FALSE,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_reels_ad_creatives_active ON reels_ad_creatives (is_active, placement)`);
  await ensureReelsAdsV2Columns();
  await ensureReelsAdsPaymentTables();
  adsEnsured = true;
}

let adsPaymentsEnsured = false;

export async function ensureReelsAdsPaymentTables(): Promise<void> {
  if (adsPaymentsEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS reels_ad_topup_orders (
      id SERIAL PRIMARY KEY,
      advertiser_id INTEGER NOT NULL REFERENCES reels_advertisers(id) ON DELETE CASCADE,
      amount_inr NUMERIC(12, 2) NOT NULL,
      razorpay_order_id VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'created',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reels_ad_payments (
      id SERIAL PRIMARY KEY,
      advertiser_id INTEGER NOT NULL REFERENCES reels_advertisers(id) ON DELETE CASCADE,
      order_id INTEGER REFERENCES reels_ad_topup_orders(id) ON DELETE SET NULL,
      amount_inr NUMERIC(12, 2) NOT NULL,
      razorpay_order_id VARCHAR(64) NOT NULL,
      razorpay_payment_id VARCHAR(64) NOT NULL UNIQUE,
      payment_method VARCHAR(32),
      status VARCHAR(20) NOT NULL DEFAULT 'captured',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  adsPaymentsEnsured = true;
}

async function ensureReelsAdsV2Columns(): Promise<void> {
  await query(`ALTER TABLE reels_ad_campaigns ADD COLUMN IF NOT EXISTS objective VARCHAR(24) NOT NULL DEFAULT 'brand_awareness'`);
  await query(`ALTER TABLE reels_ad_campaigns ADD COLUMN IF NOT EXISTS bid_model VARCHAR(12) NOT NULL DEFAULT 'cpm'`);
  await query(`ALTER TABLE reels_ad_campaigns ADD COLUMN IF NOT EXISTS bid_amount_inr NUMERIC(10, 2) NOT NULL DEFAULT 120`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS format VARCHAR(20) NOT NULL DEFAULT 'video'`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS image_url TEXT`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS headline VARCHAR(120)`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS description TEXT`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS cta_type VARCHAR(20) NOT NULL DEFAULT 'learn_more'`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS destination_url TEXT`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS play_store_url TEXT`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS app_store_url TEXT`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS app_name VARCHAR(80)`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS clicks BIGINT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE reels_ad_creatives ALTER COLUMN video_url DROP NOT NULL`);
  await query(`ALTER TABLE reels_ad_impressions ADD COLUMN IF NOT EXISTS clicked BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE reels_ad_impressions ADD COLUMN IF NOT EXISTS cost_inr NUMERIC(10, 4) NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(24) NOT NULL DEFAULT 'pending_review'`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS moderation_reason TEXT`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(120)`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS app_developer VARCHAR(120)`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS app_rating NUMERIC(2, 1)`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS app_review_count VARCHAR(32)`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS app_download_count VARCHAR(32)`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS app_category VARCHAR(80)`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS app_price_label VARCHAR(24) NOT NULL DEFAULT 'FREE'`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS promo_image_url TEXT`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS promo_image_url_2 TEXT`);
  await query(`ALTER TABLE reels_ad_creatives ADD COLUMN IF NOT EXISTS sponsored_label VARCHAR(40) NOT NULL DEFAULT 'Sponsored'`);
}
