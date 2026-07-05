-- developer_api_accounts.updated_at used by billing, invoices, and logo updates.
ALTER TABLE developer_api_accounts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
