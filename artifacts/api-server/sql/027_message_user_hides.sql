-- Per-user "delete for me" on messages (e.g. incoming business API templates)
CREATE TABLE IF NOT EXISTS message_user_hides (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_user_hides_user ON message_user_hides(user_id, created_at DESC);
