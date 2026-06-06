-- Per-user chat delete: messages before this timestamp are hidden from list + history.
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS history_cleared_at TIMESTAMPTZ;
