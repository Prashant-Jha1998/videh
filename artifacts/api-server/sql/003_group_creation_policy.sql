CREATE TABLE IF NOT EXISTS user_group_creation_policy (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  strike_count INTEGER NOT NULL DEFAULT 0,
  suspended_until TIMESTAMPTZ,
  permanently_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  last_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

