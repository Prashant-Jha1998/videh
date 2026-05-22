import crypto from "node:crypto";
import { query } from "./db";

function encryptionKey(): Buffer {
  const raw =
    process.env.DEV_API_SECRET_ENCRYPTION_KEY?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.DEV_PORTAL_SESSION_SECRET?.trim() ||
    "";
  if (raw.length < 16) {
    throw new Error("DEV_API_SECRET_ENCRYPTION_KEY or SESSION_SECRET (16+ chars) required for API secret vault");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export async function ensureApiSecretEncColumn(): Promise<void> {
  await query(
    `ALTER TABLE developer_api_accounts ADD COLUMN IF NOT EXISTS api_key_secret_enc TEXT`,
  );
}

export function encryptApiSecret(plain: string): string {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptApiSecret(blob: string | null | undefined): string | null {
  if (!blob) return null;
  try {
    const buf = Buffer.from(blob, "base64");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function hashApiSecret(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

export function generateApiSecret(): string {
  return `vsec_${crypto.randomBytes(24).toString("hex")}`;
}

export async function storeApiSecretForAccount(accountId: number, apiSecret: string): Promise<void> {
  await ensureApiSecretEncColumn();
  const secretHash = hashApiSecret(apiSecret);
  const enc = encryptApiSecret(apiSecret);
  await query(
    `UPDATE developer_api_accounts SET api_key_secret_hash = $1, api_key_secret_enc = $2 WHERE id = $3`,
    [secretHash, enc, accountId],
  );
}

export async function rotateApiSecretForAccount(accountId: number): Promise<string> {
  const apiSecret = generateApiSecret();
  await storeApiSecretForAccount(accountId, apiSecret);
  return apiSecret;
}
