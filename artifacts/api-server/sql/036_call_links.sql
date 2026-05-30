CREATE TABLE IF NOT EXISTS call_links (
  id SERIAL PRIMARY KEY,
  token VARCHAR(64) NOT NULL UNIQUE,
  host_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL,
  call_type VARCHAR(16) NOT NULL DEFAULT 'video',
  title VARCHAR(120),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_links_token ON call_links(token);
CREATE INDEX IF NOT EXISTS idx_call_links_host ON call_links(host_user_id);
