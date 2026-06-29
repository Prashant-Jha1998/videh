CREATE TABLE IF NOT EXISTS user_business_marketing_prefs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  marketing_stopped BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, business_user_id)
);

CREATE INDEX IF NOT EXISTS idx_business_marketing_stopped
ON user_business_marketing_prefs (business_user_id, user_id)
WHERE marketing_stopped = TRUE;
