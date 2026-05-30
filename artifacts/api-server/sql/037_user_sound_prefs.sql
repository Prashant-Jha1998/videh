-- Per-user premium notification sounds (synced from app for FCM channel/sound).
CREATE TABLE IF NOT EXISTS user_sound_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  global_message_sound TEXT NOT NULL DEFAULT 'msg_default',
  global_group_message_sound TEXT NOT NULL DEFAULT 'msg_default',
  global_call_sound TEXT NOT NULL DEFAULT 'call_default',
  chat_message_sounds JSONB NOT NULL DEFAULT '{}'::jsonb,
  chat_presets JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
