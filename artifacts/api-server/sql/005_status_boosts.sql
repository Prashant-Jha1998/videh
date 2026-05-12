CREATE TABLE IF NOT EXISTS status_boosts (
  id SERIAL PRIMARY KEY,
  status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_inr INTEGER NOT NULL,
  duration_hours INTEGER NOT NULL,
  estimated_reach INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  payment_provider TEXT NOT NULL DEFAULT 'manual',
  payment_reference TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_boosts_active
  ON status_boosts (status_id, ends_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_status_boosts_user_created
  ON status_boosts (user_id, created_at DESC);
