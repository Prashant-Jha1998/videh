-- Encrypted API secret for developer portal show/hide (hash remains for auth)
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS api_key_secret_enc TEXT;
