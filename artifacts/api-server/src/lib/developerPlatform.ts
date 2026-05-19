import { query } from "./db";
import { ensureDeveloperTemplateTables } from "./developerTemplates";
import { ensureDeveloperChannelColumns } from "./developerChannel";

export type EntityType = "pvt_ltd" | "llp" | "proprietorship" | "partnership" | "other";

export type DocRequirement = { key: string; label: string; required: boolean };

export const DOCUMENT_REQUIREMENTS: Record<EntityType, DocRequirement[]> = {
  pvt_ltd: [
    { key: "coi", label: "Certificate of Incorporation (CIN)", required: true },
    { key: "moa_aoa", label: "MOA / AOA", required: true },
    { key: "gst", label: "GST Certificate", required: true },
    { key: "pan_company", label: "Company PAN", required: true },
    { key: "pan_director", label: "Director PAN + Aadhaar/Passport", required: true },
  ],
  llp: [
    { key: "llp_deed", label: "LLP Agreement / Deed", required: true },
    { key: "llpin", label: "LLPIN Certificate", required: true },
    { key: "gst", label: "GST Certificate", required: true },
    { key: "pan_llp", label: "LLP PAN", required: true },
    { key: "partner_id", label: "Designated Partner ID proof", required: true },
  ],
  proprietorship: [
    { key: "gst", label: "GST Certificate", required: true },
    { key: "udyam", label: "Udyam Registration", required: true },
    { key: "pan", label: "Proprietor PAN", required: true },
    { key: "trade_license", label: "Trade License / Shop Act (if any)", required: false },
  ],
  partnership: [
    { key: "partnership_deed", label: "Partnership Deed", required: true },
    { key: "gst", label: "GST Certificate", required: true },
    { key: "pan_firm", label: "Firm PAN", required: true },
    { key: "udyam", label: "Udyam (recommended)", required: false },
  ],
  other: [
    { key: "registration", label: "Business registration proof", required: true },
    { key: "gst", label: "GST / tax registration", required: true },
    { key: "pan", label: "Business PAN", required: true },
  ],
};

export const WIZARD_STEPS = ["plan", "company", "documents", "profile", "channel", "payment", "done"] as const;

export async function ensureDeveloperPlatformTables(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS developer_leads (
      id SERIAL PRIMARY KEY,
      reference_code TEXT NOT NULL UNIQUE,
      company_name TEXT NOT NULL DEFAULT '',
      entity_type TEXT NOT NULL DEFAULT 'pvt_ltd',
      contact_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      website TEXT,
      gstin TEXT,
      monthly_volume TEXT NOT NULL DEFAULT 'under_10k',
      use_case TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      plan_id TEXT,
      amount_inr INTEGER NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'none',
      razorpay_order_id TEXT,
      razorpay_payment_id TEXT,
      payment_method TEXT,
      paid_at TIMESTAMPTZ,
      admin_notes TEXT,
      assigned_admin TEXT,
      reviewed_at TIMESTAMPTZ,
      approval_phase TEXT NOT NULL DEFAULT 'plan',
      wizard_step TEXT NOT NULL DEFAULT 'plan',
      display_name TEXT,
      business_category TEXT,
      business_description TEXT,
      business_address TEXT,
      logo_url TEXT,
      cin TEXT,
      llpin TEXT,
      udyam TEXT,
      source_ip TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const alters = [
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS entity_type TEXT`,
    `ALTER TABLE developer_leads ALTER COLUMN entity_type SET DEFAULT 'pvt_ltd'`,
    `UPDATE developer_leads SET entity_type = 'pvt_ltd' WHERE entity_type IS NULL OR entity_type = ''`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS plan_id TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS amount_inr INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'none'`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS payment_method TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS admin_notes TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS assigned_admin TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS approval_phase TEXT NOT NULL DEFAULT 'plan'`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS wizard_step TEXT NOT NULL DEFAULT 'plan'`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS display_name TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS business_category TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS business_description TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS business_address TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS logo_url TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS cin TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS llpin TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS udyam TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS payment_method_verified BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE developer_leads ALTER COLUMN company_name SET DEFAULT ''`,
    `ALTER TABLE developer_leads ALTER COLUMN contact_name SET DEFAULT ''`,
    `ALTER TABLE developer_leads ALTER COLUMN email SET DEFAULT ''`,
    `ALTER TABLE developer_leads ALTER COLUMN phone SET DEFAULT ''`,
  ];
  for (const sql of alters) {
    try {
      await query(sql);
    } catch {
      /* ignore benign alter races on legacy schemas */
    }
  }

  await query(`
    CREATE TABLE IF NOT EXISTS developer_lead_documents (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES developer_leads(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (lead_id, doc_type)
    )
  `);

  await query(`
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
    )
  `);

  const accountAlters = [
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_user_initiated_month INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_business_marketing_month INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_business_utility_month INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_business_auth_month INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_business_service_month INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS conv_free_user_used_month INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS usage_billing_month_inr INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS billing_month_key TEXT`,
  ];
  for (const sql of accountAlters) await query(sql);

  await query(`
    CREATE TABLE IF NOT EXISTS developer_conversations (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES developer_api_accounts(id) ON DELETE CASCADE,
      initiator TEXT NOT NULL,
      category TEXT,
      amount_inr INTEGER NOT NULL DEFAULT 0,
      billed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS developer_billing_events (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES developer_api_accounts(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      amount_inr INTEGER NOT NULL DEFAULT 0,
      razorpay_payment_id TEXT,
      status TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await ensureDeveloperTemplateTables();
  await ensureDeveloperChannelColumns();
}

export function documentsForEntity(entityType: string): DocRequirement[] {
  const key = entityType as EntityType;
  return DOCUMENT_REQUIREMENTS[key] ?? DOCUMENT_REQUIREMENTS.other;
}
