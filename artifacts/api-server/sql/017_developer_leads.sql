  CREATE TABLE IF NOT EXISTS developer_leads (
    id SERIAL PRIMARY KEY,
    reference_code TEXT NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    website TEXT,
    gstin TEXT,
    monthly_volume TEXT NOT NULL DEFAULT 'under_10k',
    use_case TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    source_ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_developer_leads_created ON developer_leads(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_developer_leads_status ON developer_leads(status);
