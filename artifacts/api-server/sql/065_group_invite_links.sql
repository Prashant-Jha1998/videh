-- Secure group invite links (opaque token) + admin approval for link joiners.

CREATE TABLE IF NOT EXISTS group_invite_links (
  token TEXT PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_group_invite_links_chat
  ON group_invite_links (chat_id)
  WHERE revoked_at IS NULL;

ALTER TABLE chat_members
  ADD COLUMN IF NOT EXISTS join_pending_approval BOOLEAN NOT NULL DEFAULT FALSE;
