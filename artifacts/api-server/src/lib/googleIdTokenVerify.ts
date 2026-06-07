export type GoogleIdTokenPayload = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
};

export function resolveGoogleOAuthClientId(): string | null {
  const id =
    process.env.DEVELOPER_GOOGLE_CLIENT_ID?.trim()
    || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
    || process.env.VITE_GOOGLE_CLIENT_ID?.trim();
  return id || null;
}

/** Verify Google Identity Services ID token (GIS one-tap / sign-in button). */
export async function verifyGoogleIdToken(
  idToken: string,
  expectedClientId: string,
): Promise<GoogleIdTokenPayload | null> {
  const token = idToken.trim();
  if (!token) return null;

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) return null;

  const data = await res.json() as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    picture?: string;
    error?: string;
  };
  if (data.error || !data.sub || !data.email) return null;
  if (data.aud !== expectedClientId) return null;

  const verified = data.email_verified === true || data.email_verified === "true";
  if (!verified) return null;

  return {
    sub: data.sub,
    email: data.email,
    emailVerified: true,
    name: data.name,
    picture: data.picture,
  };
}
