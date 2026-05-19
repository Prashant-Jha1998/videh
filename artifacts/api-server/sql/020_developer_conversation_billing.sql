ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS payment_method_verified BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_user_initiated_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_business_marketing_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_business_utility_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_business_auth_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_business_service_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_free_user_used_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS usage_billing_month_inr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS billing_month_key TEXT;

CREATE TABLE IF NOT EXISTS developer_conversations (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES developer_api_accounts(id) ON DELETE CASCADE,
  initiator TEXT NOT NULL,
  category TEXT,
  amount_inr INTEGER NOT NULL DEFAULT 0,
  billed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_developer_conversations_account ON developer_conversations(account_id, created_at DESC);
