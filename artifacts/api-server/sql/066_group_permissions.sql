-- standard granular group permissions (per-group toggles).

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS perm_members_edit_info BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS perm_members_add_members BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS perm_members_invite_link BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS perm_members_share_history BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS perm_approve_new_members BOOLEAN NOT NULL DEFAULT FALSE;
