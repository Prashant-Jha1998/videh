import * as Contacts from "expo-contacts";
import { Platform } from "react-native";
import { jsonAuthHeaders } from "@/lib/authHeaders";
import { normalizePhone } from "@/lib/videhContacts";

/** Upload device address book to server so Videh Web can show contacts (WhatsApp-style). */
export async function syncDeviceContactsToServer(
  apiUrl: string,
  sessionToken?: string | null,
): Promise<number> {
  if (Platform.OS === "web") return 0;

  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") return 0;

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
  });

  const payload: Array<{ phone: string; name: string }> = [];
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

  if (payload.length === 0) return 0;

  const res = await fetch(`${apiUrl}/api/users/sync-contacts`, {
    method: "POST",
    headers: jsonAuthHeaders(sessionToken),
    body: JSON.stringify({ contacts: payload }),
  });

  if (!res.ok) return 0;
  const json = (await res.json()) as { synced?: number };
  return Number(json.synced ?? 0);
}
