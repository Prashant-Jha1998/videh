import crypto from "node:crypto";
import type { Request, Response } from "express";

export const DEV_PORTAL_COOKIE = "videh_dev_portal_session";

export type DeveloperPortalIdentity = {
  userId: number;
  email: string;
};

type SessionPayload = {
  typ: "dev_portal";
  exp: number;
  userId: number;
  email: string;
};

function getSecret(): string {
  const s = process.env["DEV_PORTAL_SESSION_SECRET"]?.trim() || process.env["SESSION_SECRET"]?.trim();
  if (s && s.length >= 16) return s;
  if (process.env["NODE_ENV"] !== "production") {
    return "dev-only-insecure-developer-portal-secret";
  }
  return "";
}

export function developerPortalSessionConfigured(): boolean {
  return getSecret().length >= 16;
}

function signPayload(secret: string, payload: object): string {
  const body = JSON.stringify(payload);
  const b64 = Buffer.from(body, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifySignedPayload(token: string | undefined): { ok: true; payload: SessionPayload } | { ok: false } {
  if (!token || !token.includes(".")) return { ok: false };
  const secret = getSecret();
  if (!secret) return { ok: false };
  const lastDot = token.lastIndexOf(".");
  const b64 = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  if (!b64 || !sig) return { ok: false };
  const expect = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length) return { ok: false };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false };
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as SessionPayload;
    if (payload.typ !== "dev_portal") return { ok: false };
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return { ok: false };
    if (!payload.userId || !payload.email) return { ok: false };
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

export function issueDeveloperPortalToken(identity: DeveloperPortalIdentity): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload: SessionPayload = {
    typ: "dev_portal",
    exp,
    userId: identity.userId,
    email: identity.email,
  };
  return signPayload(secret, payload);
}

export function parseDeveloperPortalToken(token: string | undefined): DeveloperPortalIdentity | null {
  const v = verifySignedPayload(token);
  if (!v.ok) return null;
  return { userId: v.payload.userId, email: v.payload.email };
}

export function getDeveloperPortalUser(req: Request): DeveloperPortalIdentity | null {
  const token = req.cookies?.[DEV_PORTAL_COOKIE] as string | undefined;
  return parseDeveloperPortalToken(token);
}

export function portalCookieOpts(maxAgeMs: number) {
  const secure = process.env["NODE_ENV"] === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge: maxAgeMs,
    path: "/",
  };
}

export function setDeveloperPortalCookie(res: Response, token: string): void {
  res.cookie(DEV_PORTAL_COOKIE, token, portalCookieOpts(30 * 24 * 60 * 60 * 1000));
}

export function clearDeveloperPortalCookie(res: Response): void {
  res.clearCookie(DEV_PORTAL_COOKIE, { path: "/" });
}
