-- Run once against your Postgres DB (e.g. psql or Neon SQL editor).
ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS group_messaging_policy TEXT NOT NULL DEFAULT 'everyone';

ALTER TABLE chat_members
  ADD COLUMN IF NOT EXISTS can_send_messages BOOLEAN NOT NULL DEFAULT TRUE;

-- Optional: enforce known values at DB level (comment out if you prefer app-only validation)
-- ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_group_messaging_policy_check;
-- ALTER TABLE chats ADD CONSTRAINT chats_group_messaging_policy_check
--   CHECK (group_messaging_policy IN ('everyone', 'admins_only', 'allowlist'));
