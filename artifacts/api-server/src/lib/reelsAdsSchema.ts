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
  adsEnsured = true;
}
