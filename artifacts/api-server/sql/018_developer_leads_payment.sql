ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS plan_id TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS amount_inr INTEGER NOT NULL DEFAULT 0;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS assigned_admin TEXT;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS approval_phase TEXT NOT NULL DEFAULT 'payment';

CREATE INDEX IF NOT EXISTS idx_developer_leads_payment ON developer_leads(payment_status, status);
