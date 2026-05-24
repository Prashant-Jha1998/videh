import * as Contacts from "expo-contacts";
import type { ExistingContact } from "expo-contacts";
import { contactDisplayName } from "./contactMessage";

export type ContactShareRow = {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
};

function buildRows(data: ExistingContact[]): ContactShareRow[] {
  const out: ContactShareRow[] = [];
  const seen = new Set<string>();

  for (const c of data) {
    const name = contactDisplayName(c);
    const phones = (c.phoneNumbers ?? [])
      .map((p) => (p.number ?? "").trim())
      .filter(Boolean);
    const emails = (c.emails ?? [])
      .map((e) => (e.email ?? "").trim())
      .filter(Boolean);
    if (!name && phones.length === 0 && emails.length === 0) continue;

    const key = `${name}|${phones[0] ?? emails[0] ?? c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: String(c.id ?? key),
      name: name || phones[0] || emails[0] || "Contact",
      phones,
      emails,
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return out;
}

/** Load phone contacts for WhatsApp-style share picker. */
export async function loadDeviceContactsForShare(): Promise<ContactShareRow[]> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Contacts permission was denied.");
  }

  const fields = [
    Contacts.Fields.Name,
    Contacts.Fields.FirstName,
    Contacts.Fields.LastName,
    Contacts.Fields.PhoneNumbers,
    Contacts.Fields.Emails,
  ];

  const { data } = await Contacts.getContactsAsync({ fields, sort: Contacts.SortTypes.FirstName });
  if (data.length > 0) return buildRows(data);

  // Large phone books: paginate when the first page is empty
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

  return buildRows(aggregated);
}
