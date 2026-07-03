-- Link chat messages to the status they reply to (standard story reply).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status_reply_id INTEGER REFERENCES statuses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_status_reply ON messages(status_reply_id) WHERE status_reply_id IS NOT NULL;
