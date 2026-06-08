import * as Contacts from "expo-contacts";
import type { ExistingContact } from "expo-contacts";
import { Platform } from "react-native";
import { jsonAuthHeaders } from "@/lib/authHeaders";
import { normalizePhone } from "@/lib/videhContacts";

export type AddDeviceContactResult =
  | { ok: true }
  | { ok: false; reason: "permission" | "cancelled" | "invalid" | "failed"; message: string };

function sanitizeContactDisplayName(raw: string, phone: string): string {
  const digits = phone.replace(/\D/g, "");
  let name = raw.trim().replace(/^~+\s*/, "");
  if (!name || name.replace(/\D/g, "") === digits) {
    return phone;
  }
  return name;
}

/** Save a phone number to the device address book (WhatsApp-style Add contact). */
export async function addDeviceContact(opts: {
  name: string;
  phone: string;
}): Promise<AddDeviceContactResult> {
  if (Platform.OS === "web") {
    return { ok: false, reason: "failed", message: "Save this number from your phone's contact app." };
  }

  const phone = normalizePhone(opts.phone.trim());
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) {
    return { ok: false, reason: "invalid", message: "Invalid phone number." };
  }

  const displayName = sanitizeContactDisplayName(opts.name, phone);
  const [firstName, ...rest] = displayName.split(/\s+/).filter(Boolean);
  const lastName = rest.join(" ");

  const contactPayload: Contacts.Contact = {
    contactType: Contacts.ContactTypes.Person,
    firstName: firstName || displayName,
    ...(lastName ? { lastName } : {}),
    phoneNumbers: [{ number: phone, label: "mobile" }],
  };

  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") {
    return {
      ok: false,
      reason: "permission",
      message: "Allow Contacts access to save this contact.",
    };
  }

  try {
    await Contacts.addContactAsync(contactPayload);
    return { ok: true };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const missingWrite = /WRITE_CONTACTS|MissingPermission/i.test(errMsg);

    if (Platform.OS === "android" || missingWrite) {
      try {
        await Contacts.presentFormAsync(null, contactPayload);
        const saved = await isPhoneInDeviceContacts(phone);
        if (saved) return { ok: true };
        return { ok: false, reason: "cancelled", message: "Contact was not saved." };
      } catch {
        if (missingWrite) {
          return {
            ok: false,
            reason: "permission",
            message: "Allow Contacts write access in Settings, then try again.",
          };
        }
      }
    }

    return { ok: false, reason: "failed", message: "Could not save this contact." };
  }
}

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

/** True when any device contact shares the same normalized digits as `phone`. */
export async function isPhoneInDeviceContacts(phone: string): Promise<boolean> {
  const target = normalizePhone(phone).replace(/\D/g, "");
  if (target.length < 10) return false;

  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") return false;

  const data = await loadAllDeviceContacts();
  for (const c of data) {
    for (const pn of c.phoneNumbers ?? []) {
      const norm = normalizePhone(pn.number ?? "").replace(/\D/g, "");
      if (norm.length >= 10 && norm === target) return true;
    }
  }
  return false;
}
