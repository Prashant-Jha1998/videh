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

export function verifySessionToken(token: string | undefined): number | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = signPayload(payload);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown; exp?: unknown };
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
