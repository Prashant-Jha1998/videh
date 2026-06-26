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

/** Videh spacing for Indian mobile numbers (+91 XXXXX XXXXX). */
export function formatDisplayPhone(raw: string): string {
  const norm = normalizePhone(raw);
  const digits = norm.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) {
    const local = digits.slice(2);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  if (norm.startsWith("+")) return norm;
  return raw.trim() || norm;
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
export async function loadVidehContacts(
  apiUrl: string,
  myPhone: string,
  sessionToken?: string | null,
): Promise<VidehContact[]> {
  if (Platform.OS === "web") return [];

  const { status: perm } = await Contacts.requestPermissionsAsync();
  if (perm !== "granted") return [];

  const { loadAllDeviceContacts, checkPhonesRegistered } = await import("@/lib/deviceContacts");
  const data = await loadAllDeviceContacts();

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

  const registered = await checkPhonesRegistered(apiUrl, phones, sessionToken);

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
