CREATE INDEX IF NOT EXISTS idx_chat_members_user_chat ON chat_members(user_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat_user ON chat_members(chat_id, user_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat_admin ON chat_members(chat_id, user_id, is_admin);

CREATE INDEX IF NOT EXISTS idx_messages_chat_created_not_deleted
  ON messages(chat_id, created_at DESC)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_messages_chat_sender_created_not_deleted
  ON messages(chat_id, sender_id, created_at DESC)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_message_status_message_user ON message_status(message_id, user_id);
CREATE INDEX IF NOT EXISTS idx_message_status_user_status ON message_status(user_id, status);

CREATE INDEX IF NOT EXISTS idx_statuses_active_created ON statuses(expires_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_statuses_user_active ON statuses(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_boosts_active ON status_boosts(status_id, status, ends_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_views_status_viewer ON status_views(status_id, viewer_id);
CREATE INDEX IF NOT EXISTS idx_status_reactions_status_user ON status_reactions(status_id, user_id);

CREATE INDEX IF NOT EXISTS idx_blocked_users_pair ON blocked_users(blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due ON scheduled_messages(sent, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sos_contacts_user ON sos_contacts(user_id, contact_user_id);
