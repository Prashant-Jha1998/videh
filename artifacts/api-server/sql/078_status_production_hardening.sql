-- Production hardening for stories/statuses: audience, media ownership, payment uniqueness, optional geo.

ALTER TABLE statuses
  ADD COLUMN IF NOT EXISTS audience_mode TEXT NOT NULL DEFAULT 'all_contacts';

CREATE TABLE IF NOT EXISTS status_audience (
  status_id INTEGER NOT NULL REFERENCES statuses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (status_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_status_audience_user
  ON status_audience (user_id, status_id);

ALTER TABLE status_media_files
  ADD COLUMN IF NOT EXISTS uploader_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_status_boosts_payment_reference_unique
  ON status_boosts (payment_reference)
  WHERE payment_reference IS NOT NULL AND payment_reference <> '';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_city TEXT,
  ADD COLUMN IF NOT EXISTS profile_state TEXT;

CREATE INDEX IF NOT EXISTS idx_statuses_expires_at ON statuses (expires_at);
CREATE INDEX IF NOT EXISTS idx_status_media_files_created ON status_media_files (created_at);
