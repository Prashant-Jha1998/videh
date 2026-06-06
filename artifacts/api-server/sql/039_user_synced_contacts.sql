-- Phone address book synced from mobile app for Videh Web contact picker (WhatsApp-style).
CREATE TABLE IF NOT EXISTS user_synced_contacts (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_user_synced_contacts_user ON user_synced_contacts(user_id);
