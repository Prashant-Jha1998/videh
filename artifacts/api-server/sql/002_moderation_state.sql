CREATE TABLE IF NOT EXISTS user_moderation_state (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  strike_count INTEGER NOT NULL DEFAULT 0,
  suspended_until TIMESTAMPTZ,
  permanently_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  last_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS moderation_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  excerpt TEXT,
  severity TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

