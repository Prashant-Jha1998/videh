-- Fix legacy developer_leads table (from 017) for onboarding wizard + payments
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE developer_leads ALTER COLUMN entity_type SET DEFAULT 'pvt_ltd';
UPDATE developer_leads SET entity_type = 'pvt_ltd' WHERE entity_type IS NULL OR entity_type = '';

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
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS approval_phase TEXT NOT NULL DEFAULT 'plan';
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
ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS payment_method_verified BOOLEAN NOT NULL DEFAULT false;
