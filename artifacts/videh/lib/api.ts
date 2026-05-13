const DEFAULT_DOMAIN = "videh.co.in";

function toBaseUrl(domain: string): string {
  return /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
}

export const BASE_URL = (() => {
  const configuredDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  const domain = configuredDomain && configuredDomain.length > 0
    ? configuredDomain
    : DEFAULT_DOMAIN;
  return toBaseUrl(domain);
})();

export function getApiUrl(): string {
  return BASE_URL;
}

export const api = async (path: string, options?: RequestInit) => {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
};
