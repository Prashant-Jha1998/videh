-- Extended privacy preferences (profile, status, messaging, calls)
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_privacy TEXT NOT NULL DEFAULT 'contacts';
ALTER TABLE users ADD COLUMN IF NOT EXISTS about_privacy TEXT NOT NULL DEFAULT 'contacts';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_privacy TEXT NOT NULL DEFAULT 'contacts';
ALTER TABLE users ADD COLUMN IF NOT EXISTS groups_privacy TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE users ADD COLUMN IF NOT EXISTS read_receipts_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_disappear_seconds INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS silence_unknown_callers BOOLEAN NOT NULL DEFAULT FALSE;
