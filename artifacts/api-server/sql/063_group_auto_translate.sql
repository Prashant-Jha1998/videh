-- Group auto-translation: per-group toggle, per-member language, translation cache.

ALTER TABLE chats
  ADD COLUMN IF NOT EXISTS auto_translate_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE chat_members
  ADD COLUMN IF NOT EXISTS translate_lang TEXT,
  ADD COLUMN IF NOT EXISTS auto_translate_personal BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS message_translations (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  target_lang TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_lang TEXT,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_message_translations_message
  ON message_translations (message_id);
