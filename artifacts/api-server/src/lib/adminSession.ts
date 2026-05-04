import crypto from "node:crypto";

export const ADMIN_COOKIE = "videh_admin_session";
export const ADMIN_PREAUTH_COOKIE = "videh_admin_preauth";

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

function verifySignedPayload(
  token: string | undefined,
  expectedTyp: string | null,
): { ok: true; payload: Record<string, unknown> } | { ok: false } {
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
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof payload["exp"] !== "number" || (payload["exp"] as number) < Date.now()) return { ok: false };
    if (expectedTyp !== null) {
      if (payload["typ"] !== expectedTyp) return { ok: false };
    } else {
      if (payload["typ"] !== undefined && payload["typ"] !== "session") return { ok: false };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

export function issueAdminSessionToken(): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  return signPayload(secret, { typ: "session", exp });
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  const v = verifySignedPayload(token, "session");
  if (v.ok) return true;
  const legacy = verifySignedPayload(token, null);
  if (!legacy.ok) return false;
  return legacy.payload["typ"] === undefined || legacy.payload["typ"] === "session";
}

/** Short-lived cookie after password OK, before TOTP. */
export function issuePreauthToken(): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const exp = Date.now() + 5 * 60 * 1000;
  return signPayload(secret, { typ: "preauth", exp });
}

export function verifyPreauthToken(token: string | undefined): boolean {
  const v = verifySignedPayload(token, "preauth");
  return v.ok;
}

export function adminSessionConfigured(): boolean {
  return Boolean(getSecret());
}
