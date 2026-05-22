-- Developer portal accounts (sign up before API application)
CREATE TABLE IF NOT EXISTS developer_portal_users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_portal_users_email
  ON developer_portal_users (LOWER(email));

ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS portal_user_id INTEGER REFERENCES developer_portal_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_developer_leads_portal_user ON developer_leads(portal_user_id);
