-- Approved message templates per developer API account (and lead during review)
CREATE TABLE IF NOT EXISTS developer_message_templates (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES developer_leads(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES developer_api_accounts(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'utility',
  language TEXT NOT NULL DEFAULT 'en',
  header_type TEXT,
  body_text TEXT NOT NULL,
  body_preview TEXT,
  variables_json JSONB NOT NULL DEFAULT '[]',
  footer_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_dev_templates_account ON developer_message_templates(account_id);
CREATE INDEX IF NOT EXISTS idx_dev_templates_status ON developer_message_templates(status);

-- Outbound API message log (audit + delivery reference)
CREATE TABLE IF NOT EXISTS developer_api_messages (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES developer_api_accounts(id) ON DELETE CASCADE,
  template_id INTEGER REFERENCES developer_message_templates(id) ON DELETE SET NULL,
  external_id TEXT NOT NULL UNIQUE,
  recipient_phone TEXT NOT NULL,
  template_key TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  payload_json JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  billing_amount_inr INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_api_messages_account ON developer_api_messages(account_id, created_at DESC);
