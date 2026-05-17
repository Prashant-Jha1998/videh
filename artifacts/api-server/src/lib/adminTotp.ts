import { Secret, TOTP } from "otpauth";

function normalizeBase32(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase().replace(/=+$/, "");
}

function secretFromBase32(raw: string): Secret | null {
  try {
    const normalized = normalizeBase32(raw);
    if (normalized.length < 8) return null;
    return Secret.fromBase32(normalized);
  } catch {
    return null;
  }
}

export function adminTotpConfigured(): boolean {
  const raw = process.env["ADMIN_TOTP_SECRET"]?.trim();
  if (raw && secretFromBase32(raw)) return true;
  return false;
}

export function verifyTotpWithSecret(secretRaw: string, code: string): boolean {
  const secret = secretFromBase32(secretRaw);
  if (!secret) return false;
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) return false;
  const totp = new TOTP({
    issuer: "Videh",
    label: "Admin",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return totp.validate({ token: digits, window: 1 }) !== null;
}

/** Env super-admin TOTP (legacy). */
export function verifyAdminTotpCode(code: string): boolean {
  const raw = process.env["ADMIN_TOTP_SECRET"]?.trim();
  if (!raw) return false;
  return verifyTotpWithSecret(raw, code);
}
