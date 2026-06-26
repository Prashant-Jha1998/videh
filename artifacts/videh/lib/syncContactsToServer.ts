import { Platform } from "react-native";
import * as Contacts from "expo-contacts";
import { jsonAuthHeaders } from "@/lib/authHeaders";
import { deviceContactsToPhoneEntries, loadAllDeviceContacts } from "@/lib/deviceContacts";

/** Upload device address book to server so Videh Web can show contacts (Videh). */
export async function syncDeviceContactsToServer(
  apiUrl: string,
  sessionToken?: string | null,
): Promise<number> {
  if (Platform.OS === "web") return 0;

  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") return 0;

  const data = await loadAllDeviceContacts();
  const payload = deviceContactsToPhoneEntries(data);
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
