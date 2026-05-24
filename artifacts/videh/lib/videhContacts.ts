import * as Contacts from "expo-contacts";
import { Platform } from "react-native";

export interface VidehContact {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  videhId: number;
  videhName: string;
  about?: string;
  avatarUrl?: string;
}

export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("91") && digits.length === 13) return `+${digits.slice(1)}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/** Phone book contacts who are registered on Videh (same logic as Contacts screen). */
export async function loadVidehContacts(apiUrl: string, myPhone: string): Promise<VidehContact[]> {
  if (Platform.OS === "web") return [];

  const { status: perm } = await Contacts.requestPermissionsAsync();
  if (perm !== "granted") return [];

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
  });

  const seen = new Set<string>();
  const deviceContacts: { id: string; name: string; phone: string; normalizedPhone: string }[] = [];
  for (const c of data) {
    if (!c.name || !c.phoneNumbers?.length) continue;
    for (const pn of c.phoneNumbers) {
      const raw = pn.number ?? "";
      const norm = normalizePhone(raw);
      if (norm.length < 10 || seen.has(norm)) continue;
      seen.add(norm);
      deviceContacts.push({ id: `${c.id}_${norm}`, name: c.name, phone: raw, normalizedPhone: norm });
    }
  }

  const phones = [...seen];
  if (phones.length === 0) return [];

  const res = await fetch(`${apiUrl}/api/users/check-phones`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phones }),
  });
  const json = await res.json();
  const registered: Record<string, { id: number; name?: string; about?: string; avatarUrl?: string }> =
    json.registered ?? {};

  const onVideh: VidehContact[] = [];
  for (const c of deviceContacts) {
    if (c.normalizedPhone === myPhone) continue;
    const reg = registered[c.normalizedPhone];
    if (reg) {
      onVideh.push({
        ...c,
        videhId: reg.id,
        videhName: reg.name ?? c.name,
        about: reg.about,
        avatarUrl: reg.avatarUrl,
      });
    }
  }

  onVideh.sort((a, b) => a.videhName.localeCompare(b.videhName));
  return onVideh;
}
