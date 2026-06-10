/** Same-origin on video.videh.co.in (nginx proxies /api). Override for local dev. */
export function getApiBase(): string {
  const env = import.meta.env.VITE_API_BASE as string | undefined;
  if (env?.trim()) return env.replace(/\/$/, "");
  return "";
}
