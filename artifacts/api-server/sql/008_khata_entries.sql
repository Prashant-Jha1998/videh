CREATE TABLE IF NOT EXISTS khata_entries (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  debtor_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  note TEXT,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_khata_entries_chat_created
  ON khata_entries (chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_khata_entries_chat_paid
  ON khata_entries (chat_id, paid);
