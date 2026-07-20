import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEV_FALLBACK_SECRET = "videh-dev-session-secret";
const MIN_PRODUCTION_SECRET_LEN = 16;

function envSessionSecret(): string | undefined {
  const raw = process.env["SESSION_SECRET"]?.trim() || process.env["JWT_SECRET"]?.trim();
  return raw || undefined;
}

/** Fail fast at startup when production is misconfigured. */
export function assertSessionSecretConfigured(): void {
  const isProd = process.env["NODE_ENV"] === "production";
  const envSecret = envSessionSecret();
  if (!isProd) return;
  if (!envSecret) {
    throw new Error("SESSION_SECRET or JWT_SECRET must be set in production.");
  }
  if (envSecret === DEV_FALLBACK_SECRET) {
    throw new Error("Production must not use the default dev session secret.");
  }
  if (envSecret.length < MIN_PRODUCTION_SECRET_LEN) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_PRODUCTION_SECRET_LEN} characters in production.`);
  }
}

function secret(): string {
  const envSecret = envSessionSecret();
  if (envSecret) return envSecret;
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("SESSION_SECRET is not configured.");
  }
  return DEV_FALLBACK_SECRET;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueSessionToken(userId: number): string {
  const payload = b64url(JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${signPayload(payload)}`;
}

const TWO_STEP_TICKET_TTL_MS = 10 * 60 * 1000;

/** Short-lived ticket after OTP when two-step PIN is still required (not a full session). */
export function issueTwoStepTicket(userId: number): string {
  const payload = b64url(JSON.stringify({
    sub: userId,
    pur: "twostep",
    exp: Date.now() + TWO_STEP_TICKET_TTL_MS,
  }));
  return `${payload}.${signPayload(payload)}`;
}

export function verifyTwoStepTicket(token: string | undefined, expectedUserId?: number): number | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = signPayload(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: unknown;
      exp?: unknown;
      pur?: unknown;
    };
    if (parsed.pur !== "twostep") return null;
    const userId = Number(parsed.sub);
    const exp = Number(parsed.exp);
    if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
    if (expectedUserId != null && userId !== Number(expectedUserId)) return null;
    return userId;
  } catch {
    return null;
  }
}

const PHONE_CHANGE_TICKET_TTL_MS = 10 * 60 * 1000;

/** Short-lived proof that a phone number passed OTP (for change-number only). */
export function issuePhoneChangeTicket(phone: string): string {
  const payload = b64url(JSON.stringify({
    phone: String(phone),
    pur: "phonechange",
    exp: Date.now() + PHONE_CHANGE_TICKET_TTL_MS,
  }));
  return `${payload}.${signPayload(payload)}`;
}

export function verifyPhoneChangeTicket(token: string | undefined, expectedPhone: string): boolean {
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = signPayload(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      phone?: unknown;
      exp?: unknown;
      pur?: unknown;
    };
    if (parsed.pur !== "phonechange") return false;
    const exp = Number(parsed.exp);
    if (!Number.isFinite(exp) || exp < Date.now()) return false;
    return String(parsed.phone) === String(expectedPhone);
  } catch {
    return false;
  }
}

export function verifySessionToken(token: string | undefined): number | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = signPayload(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: unknown;
      exp?: unknown;
      pur?: unknown;
    };
    // Challenge tickets must not unlock normal APIs.
    if (parsed.pur === "twostep" || parsed.pur === "phonechange") return null;
    const userId = Number(parsed.sub);
    const exp = Number(parsed.exp);
    if (!userId || !Number.isFinite(exp) || exp < Date.now()) return null;
    return userId;
  } catch {
    return null;
  }
}

export function getAuthUserId(req: Request): number | null {
  const auth = req.headers.authorization;
  const queryToken = typeof req.query["token"] === "string" ? req.query["token"] : undefined;
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : queryToken;
  return verifySessionToken(token);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = getAuthUserId(req);
  if (!userId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return;
  }
  (req as any).authUserId = userId;
  next();
}

export function assertSameUser(req: Request, res: Response, userId: unknown): boolean {
  const authUserId = getAuthUserId(req);
  if (!authUserId) {
    res.status(401).json({ success: false, message: "Authentication required" });
    return false;
  }
  if (Number(userId) !== authUserId) {
    res.status(403).json({ success: false, message: "Cannot act as another user" });
    return false;
  }
  return true;
}
