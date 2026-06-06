import * as Contacts from "expo-contacts";
import type { ExistingContact } from "expo-contacts";
import { jsonAuthHeaders } from "@/lib/authHeaders";
import { normalizePhone } from "@/lib/videhContacts";

/** Load the full device address book (paginated — required on some Android builds). */
export async function loadAllDeviceContacts(): Promise<ExistingContact[]> {
  const fields = [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers];
  const aggregated: ExistingContact[] = [];
  let pageOffset = 0;
  const pageSize = 500;

  for (let guard = 0; guard < 200; guard++) {
    const res = await Contacts.getContactsAsync({
      fields,
      pageSize,
      pageOffset,
      sort: Contacts.SortTypes.FirstName,
    });
    aggregated.push(...res.data);
    if (!res.hasNextPage) break;
    pageOffset += res.data.length;
  }

  return aggregated;
}

export type DevicePhoneEntry = { phone: string; name: string };

/** Flatten device contacts to normalized phone + display name pairs. */
export function deviceContactsToPhoneEntries(data: ExistingContact[]): DevicePhoneEntry[] {
  const payload: DevicePhoneEntry[] = [];
  const seen = new Set<string>();

  for (const c of data) {
    if (!c.name || !c.phoneNumbers?.length) continue;
    for (const pn of c.phoneNumbers) {
      const norm = normalizePhone(pn.number ?? "");
      if (norm.length < 10 || seen.has(norm)) continue;
      seen.add(norm);
      payload.push({ phone: norm, name: c.name });
    }
  }

  return payload;
}

const CHECK_PHONES_CHUNK = 500;

/** Resolve which normalized phones are registered Videh users (batched). */
export async function checkPhonesRegistered(
  apiUrl: string,
  phones: string[],
  sessionToken?: string | null,
): Promise<Record<string, { id: number; name?: string; about?: string; avatarUrl?: string }>> {
  const registered: Record<string, { id: number; name?: string; about?: string; avatarUrl?: string }> = {};
  if (phones.length === 0) return registered;

  for (let i = 0; i < phones.length; i += CHECK_PHONES_CHUNK) {
    const chunk = phones.slice(i, i + CHECK_PHONES_CHUNK);
    const res = await fetch(`${apiUrl}/api/users/check-phones`, {
      method: "POST",
      headers: jsonAuthHeaders(sessionToken),
      body: JSON.stringify({ phones: chunk }),
    });
    if (res.status === 401 || res.status === 429) break;
    if (!res.ok) continue;
    const json = (await res.json()) as { registered?: Record<string, { id: number; name?: string; about?: string; avatarUrl?: string }> };
    Object.assign(registered, json.registered ?? {});
  }

  return registered;
}
