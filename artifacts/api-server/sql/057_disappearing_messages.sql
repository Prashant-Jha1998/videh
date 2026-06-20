-- Per-message expiry for disappearing messages (WhatsApp-style).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_kept BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_messages_disappear_expiry
  ON messages (expires_at)
  WHERE expires_at IS NOT NULL AND is_kept = FALSE;
