ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS wizard_step TEXT NOT NULL DEFAULT 'plan';
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS business_category TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS business_description TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS cin TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS llpin TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS udyam TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS developer_lead_documents (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES developer_leads(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, doc_type)
);

CREATE TABLE IF NOT EXISTS developer_api_accounts (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL UNIQUE REFERENCES developer_leads(id) ON DELETE CASCADE,
  reference_code TEXT NOT NULL,
  company_name TEXT NOT NULL,
  display_name TEXT,
  logo_url TEXT,
  api_key_id TEXT NOT NULL UNIQUE,
  api_key_secret_hash TEXT NOT NULL,
  billing_status TEXT NOT NULL DEFAULT 'active',
  plan_id TEXT,
  amount_inr_monthly INTEGER NOT NULL DEFAULT 0,
  messages_sent_total INTEGER NOT NULL DEFAULT 0,
  messages_sent_month INTEGER NOT NULL DEFAULT 0,
  total_billed_inr INTEGER NOT NULL DEFAULT 0,
  last_payment_at TIMESTAMPTZ,
  last_payment_failed_at TIMESTAMPTZ,
  next_billing_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS developer_billing_events (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES developer_api_accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  amount_inr INTEGER NOT NULL DEFAULT 0,
  razorpay_payment_id TEXT,
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
