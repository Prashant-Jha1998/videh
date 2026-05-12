import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  return process.env["SESSION_SECRET"] || process.env["JWT_SECRET"] || "videh-dev-session-secret";
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
