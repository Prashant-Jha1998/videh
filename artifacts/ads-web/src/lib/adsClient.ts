/**
 * Videh Ads portal HTTP client.
 * Auth uses httpOnly session cookies only — no tokens in localStorage or Authorization headers.
 */

const GATEWAY = "/api/ads-portal";

/** Remove legacy client-side token storage from older builds. */
export function purgeLegacyAdsToken(): void {
  try {
    localStorage.removeItem("videh_ads_token");
  } catch {
    /* ignore */
  }
}

purgeLegacyAdsToken();

export async function adsRequest<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts?.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
  };
  const res = await fetch(`${GATEWAY}${path}`, {
    ...opts,
    credentials: "same-origin",
    headers: { ...headers, ...(opts?.headers as Record<string, string> | undefined) },
  });
  const data = (await res.json()) as T & { success?: boolean; message?: string };
  if (!res.ok && data && typeof data === "object" && "message" in data && !data.success) {
    return data as T;
  }
  if (!res.ok) {
    throw new Error(
      typeof data === "object" && data && "message" in data && typeof data.message === "string"
        ? data.message
        : "Request failed",
    );
  }
  return data as T;
}

export async function adsSignOut(): Promise<void> {
  try {
    await adsRequest<{ success: boolean }>("/logout", { method: "POST" });
  } catch {
    /* cookie clear is best-effort */
  }
  purgeLegacyAdsToken();
}

export async function adsPortalConfig(): Promise<{
  googleSignInEnabled?: boolean;
  googleClientId?: string;
}> {
  return adsRequest("/config");
}
