import crypto from "node:crypto";
import { stateDelete, stateGetJson, stateSetJson } from "./sharedState";

/** Lock after this many wrong OTP / PIN attempts (WhatsApp-style). */
export const LOGIN_MAX_FAILS = 2;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

export type LoginGuardRecord = {
  failedAttempts: number;
  lockedUntil?: number;
};

export function guardKey(scope: string, id: string): string {
  return `login-guard:${scope}:${id}`;
}

export async function readLoginGuard(scope: string, id: string): Promise<LoginGuardRecord | null> {
  return stateGetJson<LoginGuardRecord>(guardKey(scope, id));
}

export async function writeLoginGuard(
  scope: string,
  id: string,
  record: LoginGuardRecord,
  ttlMs: number,
): Promise<void> {
  await stateSetJson(guardKey(scope, id), record, ttlMs);
}

export async function clearLoginGuard(scope: string, id: string): Promise<void> {
  await stateDelete(guardKey(scope, id));
}

/** Returns lock expiry ms if still locked, else null. */
export function activeLockExpiry(record: LoginGuardRecord | null): number | null {
  if (!record?.lockedUntil) return null;
  if (Date.now() >= record.lockedUntil) return null;
  return record.lockedUntil;
}

export function retryAfterSeconds(lockedUntil: number): number {
  return Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
}

export async function registerLoginFailure(
  scope: string,
  id: string,
  ttlMs: number,
): Promise<{ locked: boolean; retryAfterSeconds: number; attemptsRemaining: number }> {
  const cur = (await readLoginGuard(scope, id)) ?? { failedAttempts: 0 };
  const locked = activeLockExpiry(cur);
  if (locked) {
    return { locked: true, retryAfterSeconds: retryAfterSeconds(locked), attemptsRemaining: 0 };
  }

  const failedAttempts = (cur.failedAttempts ?? 0) + 1;
  if (failedAttempts >= LOGIN_MAX_FAILS) {
    const lockedUntil = Date.now() + LOGIN_LOCK_MS;
    await writeLoginGuard(scope, id, { failedAttempts, lockedUntil }, LOGIN_LOCK_MS);
    return { locked: true, retryAfterSeconds: retryAfterSeconds(lockedUntil), attemptsRemaining: 0 };
  }

  await writeLoginGuard(scope, id, { failedAttempts }, ttlMs);
  return {
    locked: false,
    retryAfterSeconds: 0,
    attemptsRemaining: LOGIN_MAX_FAILS - failedAttempts,
  };
}

export function generateOtp6(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function secretMatches(stored: string, attempt: string): boolean {
  const a = Buffer.from(String(stored).trim());
  const b = Buffer.from(String(attempt).trim());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
