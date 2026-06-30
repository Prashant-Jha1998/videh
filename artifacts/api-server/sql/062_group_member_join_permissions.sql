-- Run once against Postgres (e.g. Neon SQL editor).
-- Fixes members blocked from sending in "everyone" groups and hides pre-join history.

ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS history_cleared_at TIMESTAMPTZ;

-- Members in "all members" groups should always be able to send.
UPDATE chat_members cm
SET can_send_messages = TRUE
FROM chats c
WHERE cm.chat_id = c.id
  AND c.is_group = TRUE
  AND COALESCE(NULLIF(TRIM(c.group_messaging_policy), ''), 'everyone') = 'everyone'
  AND cm.can_send_messages = FALSE;

-- Mid-group joiners: hide messages sent before they joined.
UPDATE chat_members cm
SET history_cleared_at = cm.joined_at
WHERE cm.history_cleared_at IS NULL
  AND EXISTS (
    SELECT 1 FROM chats c
    WHERE c.id = cm.chat_id AND c.is_group = TRUE
  )
  AND EXISTS (
    SELECT 1 FROM messages m
    WHERE m.chat_id = cm.chat_id
      AND m.created_at < cm.joined_at
  );
