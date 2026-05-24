-- Last seen & online privacy (Videh-style)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_privacy TEXT NOT NULL DEFAULT 'contacts';
ALTER TABLE users ADD COLUMN IF NOT EXISTS online_privacy TEXT NOT NULL DEFAULT 'same_as_last_seen';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_except_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
