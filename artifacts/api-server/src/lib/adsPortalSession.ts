import crypto from "node:crypto";
import type { Request, Response } from "express";

export const ADS_PORTAL_COOKIE = "videh_ads_portal_session";

export type AdsPortalIdentity = {
  advertiserId: number;
  email: string;
  companyName: string;
};

type SessionPayload = {
  typ: "ads_portal";
  exp: number;
  advertiserId: number;
  email: string;
  companyName: string;
};

function getSecret(): string {
  const s = process.env["ADS_PORTAL_SESSION_SECRET"]?.trim() || process.env["SESSION_SECRET"]?.trim();
  if (s && s.length >= 16) return s;
  if (process.env["NODE_ENV"] !== "production") {
    return "dev-only-insecure-ads-portal-secret";
  }
  return "";
}

export function adsPortalSessionConfigured(): boolean {
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
  const expect = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false };
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as SessionPayload;
    if (payload.typ !== "ads_portal") return { ok: false };
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return { ok: false };
    if (!payload.advertiserId || !payload.email) return { ok: false };
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

function readToken(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = req.headers.cookie ?? "";
  const match = cookie.match(new RegExp(`${ADS_PORTAL_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function issueAdsPortalToken(identity: AdsPortalIdentity): string {
  const secret = getSecret();
  const payload: SessionPayload = {
    typ: "ads_portal",
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    advertiserId: identity.advertiserId,
    email: identity.email,
    companyName: identity.companyName,
  };
  return signPayload(secret, payload);
}

export function setAdsPortalCookie(res: Response, token: string): void {
  res.cookie(ADS_PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAdsPortalCookie(res: Response): void {
  res.clearCookie(ADS_PORTAL_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function getAdsPortalUser(req: Request): AdsPortalIdentity | null {
  const verified = verifySignedPayload(readToken(req));
  if (!verified.ok) return null;
  return {
    advertiserId: verified.payload.advertiserId,
    email: verified.payload.email,
    companyName: verified.payload.companyName,
  };
}
