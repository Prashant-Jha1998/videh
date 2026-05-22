import { query } from "./db";
import {
  extractBodyVariableIndexes,
  normalizeHeaderFormat,
  parseButtonsJson,
  parseVariableSamples,
  type TemplateButton,
} from "./templateComponents";

export type TemplateStatus = "pending" | "approved" | "rejected";
export type TemplateCategory = "marketing" | "utility" | "authentication" | "service";

export type MessageTemplateRow = {
  id: number;
  lead_id: number;
  account_id: number | null;
  template_key: string;
  name: string;
  category: string;
  language: string;
  header_type: string | null;
  header_text: string | null;
  header_media_url: string | null;
  body_text: string;
  body_preview: string | null;
  variables_json: unknown;
  variable_samples_json: unknown;
  footer_text: string | null;
  buttons_json: unknown;
  status: string;
  rejection_reason: string | null;
  submitted_at?: string;
};

export async function ensureDeveloperTemplateTables(): Promise<void> {
  await query(`
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
      header_text TEXT,
      header_media_url TEXT,
      buttons_json JSONB NOT NULL DEFAULT '[]',
      variable_samples_json JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      approved_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (lead_id, template_key)
    )
  `);
  await query(`
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
    )
  `);
  await query(`ALTER TABLE developer_message_templates ADD COLUMN IF NOT EXISTS header_text TEXT`);
  await query(`ALTER TABLE developer_message_templates ADD COLUMN IF NOT EXISTS header_media_url TEXT`);
  await query(
    `ALTER TABLE developer_message_templates ADD COLUMN IF NOT EXISTS buttons_json JSONB NOT NULL DEFAULT '[]'`,
  );
  await query(
    `ALTER TABLE developer_message_templates ADD COLUMN IF NOT EXISTS variable_samples_json JSONB NOT NULL DEFAULT '{}'`,
  );
  await query(
    `CREATE INDEX IF NOT EXISTS idx_dev_templates_account ON developer_message_templates(account_id)`,
  );
}

function parseVarsJson(row: MessageTemplateRow): string[] {
  const vars = Array.isArray(row.variables_json)
    ? row.variables_json
    : typeof row.variables_json === "string"
      ? JSON.parse(row.variables_json)
      : [];
  return Array.isArray(vars) ? vars.map(String) : [];
}

export async function linkTemplatesToAccount(leadId: number, accountId: number): Promise<void> {
  await ensureDeveloperTemplateTables();
  await query(
    `UPDATE developer_message_templates SET account_id = $1, updated_at = NOW() WHERE lead_id = $2 AND account_id IS NULL`,
    [accountId, leadId],
  );
}

export function templateToPublic(row: MessageTemplateRow) {
  const vars = parseVarsJson(row);
  const headerFormat = normalizeHeaderFormat(row.header_type);
  const buttons = parseButtonsJson(row.buttons_json);
  const variable_samples = parseVariableSamples(row.variable_samples_json);
  return {
    id: row.id,
    name: row.template_key,
    display_name: row.name,
    category: row.category,
    language: row.language,
    header_format: headerFormat,
    header_type: row.header_type,
    header_text: row.header_text ?? "",
    header_media_url: row.header_media_url ?? "",
    body_text: row.body_text,
    body_preview: row.body_preview ?? row.body_text.slice(0, 120),
    footer_text: row.footer_text ?? "",
    buttons,
    variables: vars,
    variable_indexes: extractBodyVariableIndexes(row.body_text),
    variable_samples,
    status: row.status,
  };
}

export type TemplateSubmitPayload = {
  templateKey: string;
  name?: string;
  category?: string;
  language?: string;
  headerFormat?: string;
  headerText?: string;
  headerMediaUrl?: string;
  bodyText: string;
  footerText?: string;
  buttons?: TemplateButton[] | unknown;
  variables?: string[];
  variableSamples?: Record<string, string>;
};

export function buildTemplateInsertParams(leadId: number, accountId: number | null, body: TemplateSubmitPayload) {
  const key = body.templateKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const indexes = extractBodyVariableIndexes(body.bodyText);
  const vars =
    Array.isArray(body.variables) && body.variables.length
      ? body.variables
      : indexes.map((i) => `var_${i}`);
  const headerFormat = normalizeHeaderFormat(body.headerFormat);
  const buttons = parseButtonsJson(body.buttons);
  const variable_samples = parseVariableSamples(body.variableSamples);
  const preview = body.bodyText.slice(0, 160);
  return {
    key,
    indexes,
    vars,
    headerFormat,
    buttons,
    variable_samples,
    preview,
    values: [
      leadId,
      accountId,
      key,
      body.name?.trim() || key,
      body.category ?? "utility",
      body.language ?? "en",
      headerFormat === "NONE" ? null : headerFormat,
      headerFormat === "TEXT" ? (body.headerText?.trim() || null) : null,
      headerFormat !== "NONE" && headerFormat !== "TEXT" ? body.headerMediaUrl?.trim() || null : null,
      body.bodyText.trim(),
      preview,
      JSON.stringify(vars),
      JSON.stringify(variable_samples),
      body.footerText?.trim() || null,
      JSON.stringify(buttons),
    ] as const,
  };
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}
