-- Razorpay wallet top-ups for Videh Ads (production billing)

CREATE TABLE IF NOT EXISTS reels_ad_topup_orders (
  id SERIAL PRIMARY KEY,
  advertiser_id INTEGER NOT NULL REFERENCES reels_advertisers(id) ON DELETE CASCADE,
  amount_inr NUMERIC(12, 2) NOT NULL,
  razorpay_order_id VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

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
);

CREATE INDEX IF NOT EXISTS idx_reels_ad_topup_orders_adv ON reels_ad_topup_orders (advertiser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reels_ad_payments_adv ON reels_ad_payments (advertiser_id, created_at DESC);

-- Production: new advertisers start with zero balance (pay first)
UPDATE reels_advertisers SET balance_inr = 0
WHERE email NOT IN ('ads@videh.co.in', 'pjhawithu@gmail.com')
  AND balance_inr > 0
  AND id NOT IN (SELECT DISTINCT advertiser_id FROM reels_ad_payments);
