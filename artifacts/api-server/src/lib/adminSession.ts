import crypto from "node:crypto";
import type { AdminRole } from "./adminRbac";

export const ADMIN_COOKIE = "videh_admin_session";
export const ADMIN_PREAUTH_COOKIE = "videh_admin_preauth";

export type AdminIdentity = {
  adminId: number | null;
  email: string;
  role: AdminRole;
};

type SessionPayload = {
  typ: "session";
  exp: number;
  adminId: number | null;
  email: string;
  role: AdminRole;
};

type PreauthPayload = {
  typ: "preauth";
  exp: number;
  adminId: number | null;
  email: string;
  role: AdminRole;
};

function getSecret(): string {
  const s = process.env["ADMIN_SESSION_SECRET"]?.trim();
  if (s && s.length >= 16) return s;
  if (process.env["NODE_ENV"] !== "production") {
    return "dev-only-insecure-admin-secret-change-me";
  }
  return "";
}

function signPayload(secret: string, payload: object): string {
  const body = JSON.stringify(payload);
  const b64 = Buffer.from(body, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifySignedPayload<T extends Record<string, unknown>>(
  token: string | undefined,
  expectedTyp: string,
): { ok: true; payload: T } | { ok: false } {
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
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as T;
    if (typeof payload["exp"] !== "number" || (payload["exp"] as number) < Date.now()) return { ok: false };
    if (payload["typ"] !== expectedTyp) return { ok: false };
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

export function issueAdminSessionToken(identity: AdminIdentity): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payload: SessionPayload = {
    typ: "session",
    exp,
    adminId: identity.adminId,
    email: identity.email,
    role: identity.role,
  };
  return signPayload(secret, payload);
}

export function parseAdminSessionToken(token: string | undefined): AdminIdentity | null {
  const v = verifySignedPayload<SessionPayload>(token, "session");
  if (v.ok) {
    return { adminId: v.payload.adminId, email: v.payload.email, role: v.payload.role };
  }
  const legacy = verifySignedPayload<Record<string, unknown>>(token, "session");
  if (legacy.ok && legacy.payload["typ"] === undefined) {
    const email = process.env["ADMIN_EMAIL"]?.trim().toLowerCase() ?? "platform-admin";
    return { adminId: null, email, role: "super_admin" };
  }
  return null;
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  return parseAdminSessionToken(token) !== null;
}

export function issuePreauthToken(identity: AdminIdentity): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = Date.now() + 5 * 60 * 1000;
  const payload: PreauthPayload = {
    typ: "preauth",
    exp,
    adminId: identity.adminId,
    email: identity.email,
    role: identity.role,
  };
  return signPayload(secret, payload);
}

export function parsePreauthToken(token: string | undefined): AdminIdentity | null {
  const v = verifySignedPayload<PreauthPayload>(token, "preauth");
  if (!v.ok) return null;
  return { adminId: v.payload.adminId, email: v.payload.email, role: v.payload.role };
}

export function verifyPreauthToken(token: string | undefined): boolean {
  return parsePreauthToken(token) !== null;
}

export function adminSessionConfigured(): boolean {
  return Boolean(getSecret());
}
