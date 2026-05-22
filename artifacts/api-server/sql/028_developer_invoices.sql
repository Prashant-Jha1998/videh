CREATE TABLE IF NOT EXISTS developer_invoices (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES developer_api_accounts(id) ON DELETE CASCADE,
  bill_number TEXT NOT NULL UNIQUE,
  period_key TEXT NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  plan_inr INTEGER NOT NULL DEFAULT 0,
  usage_inr INTEGER NOT NULL DEFAULT 0,
  amount_inr INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_dev_invoices_account ON developer_invoices(account_id, bill_date DESC);
