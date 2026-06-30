-- Idempotent send per client temp id (allows intentional duplicate text)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS client_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_msg_id
  ON messages (chat_id, sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
