export type VidehUser = {
  dbId: number;
  sessionToken: string;
  name?: string;
  phone?: string;
};

const STORAGE_KEY = "videh_video_user";

export function loadUser(): VidehUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VidehUser;
    if (!parsed?.dbId || !parsed?.sessionToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveUser(user: VidehUser): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearUser(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function authHeaders(token?: string | null): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
