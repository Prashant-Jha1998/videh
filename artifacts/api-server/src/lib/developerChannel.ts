import crypto from "node:crypto";
import { query } from "./db";
import { normalizePhone } from "./developerTemplates";
import { stateDelete, stateGetJson, stateSetJson } from "./sharedState";
import { logger } from "./logger";

export type ChannelStatus = "none" | "otp_pending" | "verified" | "suspended";

const CHANNEL_OTP_TTL_MS = 10 * 60 * 1000;
const channelOtpKey = (leadId: number, phone: string) => `dev-channel-otp:${leadId}:${phone}`;

/** 15-digit numeric string (Videh business channel ID). Node randomInt max span is ~2^48, so build digits explicitly. */
function random15DigitNumeric(): string {
  let digits = String(crypto.randomInt(1, 10));
  for (let i = 1; i < 15; i++) digits += String(crypto.randomInt(0, 10));
  return digits;
}

/** 15-digit numeric ID (Videh phone number ID format). */
export function generatePhoneNumberId(): string {
  return random15DigitNumeric();
}

/** 15-digit numeric Business Account ID (WABA-style). */
export function generateBusinessAccountId(): string {
  return random15DigitNumeric();
}

export async function ensureDeveloperChannelColumns(): Promise<void> {
  const leadAlters = [
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS channel_phone TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS channel_status TEXT NOT NULL DEFAULT 'none'`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS channel_verified_at TIMESTAMPTZ`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS videh_business_account_id TEXT`,
    `ALTER TABLE developer_leads ADD COLUMN IF NOT EXISTS videh_phone_number_id TEXT`,
  ];
  const accountAlters = [
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS channel_phone TEXT`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS channel_status TEXT NOT NULL DEFAULT 'none'`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS channel_verified_at TIMESTAMPTZ`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS videh_business_account_id TEXT`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS videh_phone_number_id TEXT`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS webhook_url TEXT`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS webhook_verify_token TEXT`,
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS webhook_secret TEXT`,
  ];
  for (const sql of [...leadAlters, ...accountAlters]) {
    try {
      await query(sql);
    } catch {
      /* ignore */
    }
  }
  await query(`
    CREATE TABLE IF NOT EXISTS developer_webhook_events (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES developer_api_accounts(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload_json JSONB NOT NULL DEFAULT '{}',
      delivery_status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function ensureLeadBusinessAccountId(leadId: number): Promise<string> {
  await ensureDeveloperChannelColumns();
  const r = await query(`SELECT videh_business_account_id FROM developer_leads WHERE id = $1`, [leadId]);
  const existing = (r.rows[0] as { videh_business_account_id?: string } | undefined)?.videh_business_account_id;
  if (existing) return existing;

  let id = generateBusinessAccountId();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await query(`UPDATE developer_leads SET videh_business_account_id = $1, updated_at = NOW() WHERE id = $2`, [id, leadId]);
      return id;
    } catch {
      id = generateBusinessAccountId();
    }
  }
  throw new Error("Could not allocate business account ID");
}

export async function sendChannelOtp(leadId: number, phoneRaw: string): Promise<{ phone: string; devOtp?: string }> {
  const phone = normalizePhone(phoneRaw);
  if (!phone || phone.length < 12) throw new Error("Invalid dedicated channel phone. Use 10-digit Indian mobile.");

  const ten = phone.startsWith("91") ? phone.slice(2) : phone;
  if (!/^\d{10}$/.test(ten)) throw new Error("Channel phone must be a 10-digit Indian mobile number.");

  await ensureLeadBusinessAccountId(leadId);

  const otp = String(crypto.randomInt(100000, 999999));
  await stateSetJson(channelOtpKey(leadId, ten), { otp, expiresAt: Date.now() + CHANNEL_OTP_TTL_MS }, CHANNEL_OTP_TTL_MS);

  await query(
    `UPDATE developer_leads SET channel_phone = $1, channel_status = 'otp_pending', updated_at = NOW() WHERE id = $2`,
    [phone, leadId],
  );

  const apiKey = process.env["FAST2SMS_API_KEY"];
  const senderId = process.env["FAST2SMS_SENDER_ID"] ?? "VIDEHE";
  const messageId = process.env["FAST2SMS_MESSAGE_ID"] ?? "209634";

  if (apiKey) {
    try {
      const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${apiKey}&sender_id=${senderId}&message=${messageId}&variables_values=${otp}&route=dlt&numbers=${ten}`;
      const response = await fetch(url);
      const data = (await response.json()) as { return?: boolean };
      logger.info({ leadId, phone: `***${ten.slice(-3)}`, sms: data.return }, "channel OTP send");
    } catch (err) {
      logger.error({ err, leadId }, "channel OTP SMS failed");
    }
  } else {
    logger.warn({ leadId, otp }, "FAST2SMS_API_KEY not set — channel OTP dev mode");
  }

  const devOtp = process.env.NODE_ENV !== "production" || !apiKey ? otp : undefined;
  return { phone, devOtp };
}

export async function verifyChannelOtp(
  leadId: number,
  phoneRaw: string,
  code: string,
): Promise<{
  phone: string;
  videh_phone_number_id: string;
  videh_business_account_id: string;
}> {
  const phone = normalizePhone(phoneRaw);
  const ten = phone?.startsWith("91") ? phone.slice(2) : phone;
  if (!ten || !/^\d{10}$/.test(ten)) throw new Error("Invalid phone");

  const entry = await stateGetJson<{ otp: string; expiresAt: number }>(channelOtpKey(leadId, ten));
  if (!entry) throw new Error("OTP expired or not found. Request a new code.");
  if (Date.now() > entry.expiresAt) {
    await stateDelete(channelOtpKey(leadId, ten));
    throw new Error("OTP has expired.");
  }
  if (entry.otp !== code.trim()) throw new Error("Incorrect OTP.");

  await stateDelete(channelOtpKey(leadId, ten));

  const dup = await query(
    `SELECT id FROM developer_leads WHERE channel_phone = $1 AND channel_status = 'verified' AND id != $2`,
    [phone, leadId],
  );
  if (dup.rows[0]) {
    throw new Error("This phone number is already registered on another Videh business channel.");
  }

  const vba = await ensureLeadBusinessAccountId(leadId);
  let vpn = generatePhoneNumberId();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await query(
        `UPDATE developer_leads SET
           channel_phone = $1,
           channel_status = 'verified',
           channel_verified_at = NOW(),
           videh_phone_number_id = $2,
           videh_business_account_id = COALESCE(videh_business_account_id, $3),
           wizard_step = CASE WHEN wizard_step IN ('profile', 'channel') THEN 'channel' ELSE wizard_step END,
           updated_at = NOW()
         WHERE id = $4`,
        [phone, vpn, vba, leadId],
      );
      break;
    } catch {
      vpn = generatePhoneNumberId();
    }
  }

  const row = await query(
    `SELECT videh_phone_number_id, videh_business_account_id, channel_phone FROM developer_leads WHERE id = $1`,
    [leadId],
  );
  const L = row.rows[0] as {
    videh_phone_number_id: string;
    videh_business_account_id: string;
    channel_phone: string;
  };
  return {
    phone: L.channel_phone,
    videh_phone_number_id: L.videh_phone_number_id,
    videh_business_account_id: L.videh_business_account_id,
  };
}

export async function copyChannelToAccount(leadId: number, accountId: number): Promise<void> {
  await ensureDeveloperChannelColumns();
  await query(
    `UPDATE developer_api_accounts a SET
       channel_phone = l.channel_phone,
       channel_status = l.channel_status,
       channel_verified_at = l.channel_verified_at,
       videh_phone_number_id = l.videh_phone_number_id,
       videh_business_account_id = l.videh_business_account_id
     FROM developer_leads l
     WHERE a.id = $1 AND l.id = $2`,
    [accountId, leadId],
  );
}

function last10Digits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** Channel phones exempt from auto-suspend when used on the consumer Videh app. */
const CONSUMER_LOGIN_CHANNEL_SUSPEND_EXEMPT = new Set(["8541982403"]);

/** Suspend Business API when the dedicated channel number is used on the consumer Videh app. */
export async function suspendDeveloperApiForConsumerAppLogin(tenDigitPhone: string): Promise<{ suspendedAccounts: number }> {
  const ten = last10Digits(tenDigitPhone);
  if (!ten || !/^\d{10}$/.test(ten)) return { suspendedAccounts: 0 };
  if (CONSUMER_LOGIN_CHANNEL_SUSPEND_EXEMPT.has(ten)) return { suspendedAccounts: 0 };

  await ensureDeveloperChannelColumns();

  const accounts = await query(
    `UPDATE developer_api_accounts
     SET channel_status = 'suspended',
         billing_status = 'suspended',
         updated_at = NOW()
     WHERE channel_phone IS NOT NULL
       AND channel_status IN ('verified', 'otp_pending')
       AND RIGHT(REGEXP_REPLACE(channel_phone, '\\D', '', 'g'), 10) = $1
     RETURNING id, lead_id`,
    [ten],
  );

  const leadIds = [...new Set(accounts.rows.map((r) => (r as { lead_id: number }).lead_id))];
  if (leadIds.length) {
    await query(
      `UPDATE developer_leads
       SET channel_status = 'suspended', updated_at = NOW()
       WHERE id = ANY($1::int[])
         AND channel_phone IS NOT NULL
         AND RIGHT(REGEXP_REPLACE(channel_phone, '\\D', '', 'g'), 10) = $2`,
      [leadIds, ten],
    );
  }

  if (accounts.rows.length) {
    logger.warn(
      { ten: `***${ten.slice(-3)}`, count: accounts.rows.length },
      "Developer API suspended: channel phone used on consumer Videh app",
    );
  }

  return { suspendedAccounts: accounts.rows.length };
}

export async function assertChannelVerifiedForAccount(accountId: number): Promise<{ ok: boolean; reason?: string }> {
  const r = await query(
    `SELECT channel_status, videh_phone_number_id FROM developer_api_accounts WHERE id = $1`,
    [accountId],
  );
  const row = r.rows[0] as { channel_status?: string; videh_phone_number_id?: string } | undefined;
  if (!row) return { ok: false, reason: "account_not_found" };
  if (row.channel_status === "suspended") {
    return { ok: false, reason: "channel_suspended_consumer_use" };
  }
  if (row.channel_status !== "verified" || !row.videh_phone_number_id) {
    return { ok: false, reason: "channel_not_verified" };
  }
  return { ok: true };
}

export function channelPublicFromRow(row: Record<string, unknown>) {
  return {
    channel_phone: row.channel_phone ?? null,
    channel_status: row.channel_status ?? "none",
    channel_verified_at: row.channel_verified_at ?? null,
    phone_number_id: row.videh_phone_number_id ?? null,
    business_account_id: row.videh_business_account_id ?? null,
    webhook_url: row.webhook_url ?? null,
  };
}
