import { hashAdminPassword, verifyAdminPassword } from "./adminPassword";
import { secretMatches } from "./loginAttemptGuard";
import { query } from "./db";

export async function hashTwoStepPin(pin: string): Promise<string> {
  return hashAdminPassword(pin);
}

/** Verify PIN; migrates legacy plaintext pins to scrypt on success. */
export async function verifyTwoStepPin(
  userId: number | string,
  pin: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const attempt = String(pin).trim();
  if (stored.startsWith("scrypt:")) {
    return verifyAdminPassword(attempt, stored);
  }
  // Legacy plaintext — accept once, then upgrade to hash.
  if (!secretMatches(stored, attempt)) return false;
  const hashed = await hashTwoStepPin(attempt);
  await query(`UPDATE users SET two_step_pin = $1 WHERE id = $2`, [hashed, userId]);
  return true;
}

export function isTwoStepEnabled(stored: string | null | undefined): boolean {
  return Boolean(stored && String(stored).trim());
}
