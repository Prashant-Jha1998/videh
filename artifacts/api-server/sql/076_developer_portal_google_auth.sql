-- Google sign-in for developer.videh.co.in portal accounts
ALTER TABLE developer_portal_users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE developer_portal_users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'password';
CREATE UNIQUE INDEX IF NOT EXISTS idx_developer_portal_users_google_sub
  ON developer_portal_users (google_sub) WHERE google_sub IS NOT NULL;
