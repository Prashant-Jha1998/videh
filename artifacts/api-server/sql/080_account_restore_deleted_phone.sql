-- Keep original phone on soft-delete so re-registration can restore the same user
-- (and their Videh Video / reels_channels row linked by user_id).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_users_deleted_phone
  ON users (deleted_phone)
  WHERE deleted_at IS NOT NULL AND deleted_phone IS NOT NULL;
