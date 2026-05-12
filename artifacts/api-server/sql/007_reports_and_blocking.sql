CREATE TABLE IF NOT EXISTS user_reports (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
  reason TEXT NOT NULL DEFAULT 'reported_by_user',
  details TEXT,
  block_after_report BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_reports_reported_created
  ON user_reports (reported_user_id, created_at DESC);
