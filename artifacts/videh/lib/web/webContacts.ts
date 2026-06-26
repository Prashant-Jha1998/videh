import type { Chat } from "@/context/AppContext";
import { getApiUrl } from "../api";
import type { ContactShareRow } from "../loadDeviceContactsForShare";
import { normalizePhone } from "../videhContacts";

/** Videh contacts from existing chats (Videh Web–style when device contacts unavailable). */
export function chatsToContactShareRows(chats: Chat[], myUserId?: number): ContactShareRow[] {
  const rows: ContactShareRow[] = [];
  const seen = new Set<number>();

  for (const chat of chats) {
    if (chat.isGroup || !chat.otherUserId) continue;
    const uid = Number(chat.otherUserId);
    if (!uid || seen.has(uid) || uid === myUserId) continue;
    seen.add(uid);
    rows.push({
      id: `videh_${uid}`,
      name: chat.name || "Contact",
      phones: [],
      emails: [],
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return rows;
}

export type WebVidehMember = {
  id: number;
  name: string;
  phone?: string;
  avatarUrl?: string;
  about?: string;
};

/** Group / status audience on web: people you already chat with. */
export function chatsToWebMembers(chats: Chat[], myUserId?: number): WebVidehMember[] {
  return chatsToContactShareRows(chats, myUserId).map((r) => ({
    id: Number(String(r.id).replace("videh_", "")),
    name: r.name,
  }));
}

export async function searchUsersByPhoneWeb(
  query: string,
  sessionToken?: string | null,
): Promise<WebVidehMember[]> {
  const digits = query.replace(/\D/g, "");
  if (digits.length < 3) return [];
  const enc = encodeURIComponent(digits);
  const res = await fetch(`${getApiUrl()}/api/users/search/${enc}`, {
    headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { users?: { id: number; name?: string; phone?: string; avatar_url?: string }[] };
  return (json.users ?? []).map((u) => ({
    id: u.id,
    name: u.name ?? u.phone ?? "User",
    phone: u.phone,
    about: (u as { about?: string }).about,
    avatarUrl: u.avatar_url,
  }));
}

export async function searchUsersForContactShare(
  query: string,
  sessionToken?: string | null,
): Promise<ContactShareRow[]> {
  const members = await searchUsersByPhoneWeb(query, sessionToken);
  return members.map((m) => ({
    id: `search_${m.id}`,
    name: m.name,
    phones: m.phone ? [m.phone] : [],
    emails: [],
  }));
}
