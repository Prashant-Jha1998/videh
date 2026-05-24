ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_voice_enrolled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assistant_listen_locked BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS assistant_voice_samples (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sample_index SMALLINT NOT NULL,
  fingerprint_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, sample_index)
);

CREATE INDEX IF NOT EXISTS idx_assistant_voice_samples_user ON assistant_voice_samples(user_id);
