import { getApiUrl } from "@/lib/api";
import { jsonAuthHeaders } from "@/lib/authHeaders";
import { normalizePhone } from "@/lib/videhContacts";

export type VidehContactQrPayload = {
  userId?: number;
  phone?: string;
  name?: string;
};

export function buildVidehContactQrValue(opts: {
  userId?: number;
  phone?: string;
  name?: string;
}): string {
  const params = new URLSearchParams();
  if (opts.userId) params.set("uid", String(opts.userId));
  if (opts.phone) params.set("phone", opts.phone);
  if (opts.name?.trim()) params.set("name", opts.name.trim());
  return `videh://contact?${params.toString()}`;
}

export function parseVidehContactQr(raw: string): VidehContactQrPayload | null {
  const data = raw.trim();
  if (!data.startsWith("videh://contact")) return null;
  try {
    const url = new URL(data.replace(/^videh:\/\//, "https://videh.app/"));
    const uid = url.searchParams.get("uid");
    const phone = url.searchParams.get("phone");
    const name = url.searchParams.get("name");
    return {
      userId: uid ? Number(uid) : undefined,
      phone: phone ?? undefined,
      name: name ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function resolveVidehContactFromQr(
  raw: string,
  sessionToken?: string | null,
): Promise<{ userId: number; name: string; avatarUrl?: string } | null> {
  const parsed = parseVidehContactQr(raw);
  if (!parsed) return null;

  if (parsed.userId && Number.isFinite(parsed.userId) && parsed.userId > 0) {
    try {
      const res = await fetch(`${getApiUrl()}/api/users/${parsed.userId}`, {
        headers: jsonAuthHeaders(sessionToken),
      });
      const data = (await res.json()) as {
        success?: boolean;
        user?: { id: number; name?: string; avatar_url?: string; phone?: string };
      };
      if (data.success && data.user?.id) {
        return {
          userId: Number(data.user.id),
          name: data.user.name?.trim() || parsed.name || "Contact",
          avatarUrl: data.user.avatar_url ?? undefined,
        };
      }
    } catch {
      /* fall through */
    }
    return {
      userId: parsed.userId,
      name: parsed.name?.trim() || "Contact",
    };
  }

  if (parsed.phone) {
    const phone = normalizePhone(parsed.phone);
    try {
      const res = await fetch(`${getApiUrl()}/api/users/check-phones`, {
        method: "POST",
        headers: jsonAuthHeaders(sessionToken),
        body: JSON.stringify({ phones: [phone] }),
      });
      const data = (await res.json()) as {
        registered?: Record<string, { id: number; name?: string; avatarUrl?: string }>;
      };
      const reg = data.registered?.[phone];
      if (reg?.id) {
        return {
          userId: Number(reg.id),
          name: reg.name?.trim() || parsed.name || "Contact",
          avatarUrl: reg.avatarUrl,
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}
