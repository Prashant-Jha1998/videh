ALTER TABLE statuses
  ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '24 hours';

UPDATE statuses
SET expires_at = created_at + INTERVAL '24 hours'
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_statuses_expires_at
  ON statuses (expires_at);
