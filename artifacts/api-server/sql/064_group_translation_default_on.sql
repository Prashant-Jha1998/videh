-- Per-member group translation: on by default so each member can read in their own language.
ALTER TABLE chats ALTER COLUMN auto_translate_enabled SET DEFAULT TRUE;

UPDATE chats
SET auto_translate_enabled = TRUE
WHERE is_group = TRUE AND auto_translate_enabled = FALSE;
