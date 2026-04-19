export const BASE_URL = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
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
