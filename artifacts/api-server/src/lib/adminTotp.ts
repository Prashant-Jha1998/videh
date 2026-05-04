import { Secret, TOTP } from "otpauth";

function normalizeBase32(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase().replace(/=+$/, "");
}

export function adminTotpConfigured(): boolean {
  const raw = process.env["ADMIN_TOTP_SECRET"]?.trim();
  if (!raw) return false;
  try {
    Secret.fromBase32(normalizeBase32(raw));
    return normalizeBase32(raw).length >= 8;
  } catch {
    return false;
  }
}

export function verifyAdminTotpCode(code: string): boolean {
  const raw = process.env["ADMIN_TOTP_SECRET"]?.trim();
  if (!raw) return false;
  let secret: Secret;
  try {
    secret = Secret.fromBase32(normalizeBase32(raw));
  } catch {
    return false;
  }
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
  const delta = totp.validate({ token: digits, window: 1 });
  return delta !== null;
}
