ALTER TABLE status_boosts
  ADD COLUMN IF NOT EXISTS target_state TEXT,
  ADD COLUMN IF NOT EXISTS target_city TEXT,
  ADD COLUMN IF NOT EXISTS target_radius_km INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS verification_note TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_hold_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours';

ALTER TABLE status_boosts
  ALTER COLUMN starts_at DROP NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending_verification';

CREATE INDEX IF NOT EXISTS idx_status_boosts_status_created
  ON status_boosts (status, created_at DESC);
