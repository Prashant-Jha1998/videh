export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? res.statusText);
  }
  return data as T;
}

export function fmtDate(s?: string | null): string {
  if (!s) return "—";
  return String(s).slice(0, 16).replace("T", " ");
}

export function priorityBadge(score: number): string {
  if (score >= 75) return "badge-critical";
  if (score >= 50) return "badge-high";
  if (score >= 25) return "badge-medium";
  return "badge-low";
}
