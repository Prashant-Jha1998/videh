-- Meta-style business channel: dedicated phone, Phone Number ID, Business Account ID
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS channel_phone TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS channel_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS channel_verified_at TIMESTAMPTZ;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS videh_business_account_id TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS videh_phone_number_id TEXT;

ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS channel_phone TEXT;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS channel_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS channel_verified_at TIMESTAMPTZ;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS videh_business_account_id TEXT;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS videh_phone_number_id TEXT;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS webhook_verify_token TEXT;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS webhook_secret TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_leads_vba ON developer_leads(videh_business_account_id) WHERE videh_business_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_leads_vpn ON developer_leads(videh_phone_number_id) WHERE videh_phone_number_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_accounts_vba ON developer_api_accounts(videh_business_account_id) WHERE videh_business_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_accounts_vpn ON developer_api_accounts(videh_phone_number_id) WHERE videh_phone_number_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS developer_webhook_events (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES developer_api_accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  delivery_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_webhook_events_account ON developer_webhook_events(account_id, created_at DESC);
