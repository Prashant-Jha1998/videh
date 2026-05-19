import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { query } from "./db";

export type DeveloperApiAccount = {
  id: number;
  leadId: number;
  apiKeyId: string;
  referenceCode: string;
  companyName: string;
  displayName: string | null;
  billingStatus: string;
};

function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** Parse Bearer token: `vsec_...` or `vsk_xxx:vsec_yyy` */
export function parseApiBearerToken(authHeader: string | undefined): { keyId?: string; secret: string } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  if (token.includes(":")) {
    const [keyId, secret] = token.split(":", 2);
    if (!keyId || !secret) return null;
    return { keyId: keyId.trim(), secret: secret.trim() };
  }
  return { secret: token };
}

export async function resolveDeveloperAccount(
  authHeader: string | undefined,
): Promise<DeveloperApiAccount | null> {
  const parsed = parseApiBearerToken(authHeader);
  if (!parsed) return null;

  const secretHash = hashSecret(parsed.secret);

  if (parsed.keyId) {
    const r = await query(
      `SELECT id, lead_id, api_key_id, reference_code, company_name, display_name, billing_status
       FROM developer_api_accounts
       WHERE api_key_id = $1 AND api_key_secret_hash = $2`,
      [parsed.keyId, secretHash],
    );
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return mapAccount(row);
  }

  const r = await query(
    `SELECT id, lead_id, api_key_id, reference_code, company_name, display_name, billing_status
     FROM developer_api_accounts
     WHERE api_key_secret_hash = $1`,
    [secretHash],
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapAccount(row);
}

function mapAccount(row: Record<string, unknown>): DeveloperApiAccount {
  return {
    id: Number(row.id),
    leadId: Number(row.lead_id),
    apiKeyId: String(row.api_key_id),
    referenceCode: String(row.reference_code),
    companyName: String(row.company_name),
    displayName: row.display_name != null ? String(row.display_name) : null,
    billingStatus: String(row.billing_status ?? "active"),
  };
}

export async function requireDeveloperApi(req: Request, res: Response, next: NextFunction): Promise<void> {
  const account = await resolveDeveloperAccount(req.headers.authorization);
  if (!account) {
    res.status(401).json({
      success: false,
      error: { code: "unauthorized", message: "Invalid or missing API credentials. Use Bearer vsec_... or vsk_...:vsec_..." },
    });
    return;
  }
  req.developerAccount = account;
  next();
}
