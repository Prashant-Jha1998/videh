import * as Contacts from "expo-contacts";
import type { ExistingContact } from "expo-contacts";
import { contactDisplayName, dedupeEmails, dedupePhones } from "./contactMessage";

export type ContactShareRow = {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
};

const MAX_CONTACTS = 5000;
const PAGE_SIZE = 400;
const LOAD_TIMEOUT_MS = 25_000;

const FIELDS = [
  Contacts.Fields.Name,
  Contacts.Fields.FirstName,
  Contacts.Fields.LastName,
  Contacts.Fields.PhoneNumbers,
  Contacts.Fields.Emails,
];

let cachedRows: ContactShareRow[] | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
let loadPromise: Promise<ContactShareRow[]> | null = null;

function rowFromContact(c: ExistingContact, index: number): ContactShareRow | null {
  try {
    const name = contactDisplayName(c);
    const phones = dedupePhones(
      (c.phoneNumbers ?? [])
        .map((p) => String(p.number ?? "").trim())
        .filter((p) => p.length > 0),
    ).slice(0, 8);
    const emails = dedupeEmails(
      (c.emails ?? [])
        .map((e) => String(e.email ?? "").trim())
        .filter((e) => e.length > 0),
    ).slice(0, 4);
    if (!name && phones.length === 0 && emails.length === 0) return null;

    const id = c.id != null ? String(c.id) : `c_${index}_${name.slice(0, 12)}`;
    return {
      id,
      name: name || phones[0] || emails[0] || "Contact",
      phones,
      emails,
    };
  } catch {
    return null;
  }
}

function dedupeAndSort(rows: ContactShareRow[]): ContactShareRow[] {
  const seen = new Set<string>();
  const out: ContactShareRow[] = [];
  for (const r of rows) {
    const key = `${r.name.toLowerCase()}|${r.phones[0] ?? r.emails[0] ?? r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= MAX_CONTACTS) break;
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function fetchAllContactsRaw(): Promise<ExistingContact[]> {
  const { status } = await Contacts.getPermissionsAsync();
  const granted =
    status === Contacts.PermissionStatus.GRANTED
      ? true
      : (await Contacts.requestPermissionsAsync()).status === Contacts.PermissionStatus.GRANTED;
  if (!granted) {
    throw new Error("Contacts permission was denied.");
  }

  const aggregated: ExistingContact[] = [];
  let pageOffset = 0;
  let hasNext = true;

  while (hasNext && aggregated.length < MAX_CONTACTS) {
    const res = await Contacts.getContactsAsync({
      fields: FIELDS,
      pageSize: PAGE_SIZE,
      pageOffset,
      sort: Contacts.SortTypes.FirstName,
    });
    if (res.data?.length) aggregated.push(...res.data);
    hasNext = Boolean(res.hasNextPage) && res.data.length > 0;
    pageOffset += res.data.length;
    if (res.data.length === 0) break;
  }

  return aggregated;
}

async function loadFresh(): Promise<ContactShareRow[]> {
  const raw = await withTimeout(
    fetchAllContactsRaw(),
    LOAD_TIMEOUT_MS,
    "Loading contacts took too long. Try again.",
  );

  const rows: ContactShareRow[] = [];
  for (let i = 0; i < raw.length && rows.length < MAX_CONTACTS; i++) {
    const row = rowFromContact(raw[i]!, i);
    if (row) rows.push(row);
  }

  return dedupeAndSort(rows);
}

/** Load phone contacts for share picker (cached, paginated, crash-safe). */
export function loadDeviceContactsForShare(opts?: { forceRefresh?: boolean }): Promise<ContactShareRow[]> {
  const force = opts?.forceRefresh ?? false;
  const now = Date.now();
  if (!force && cachedRows && now - cacheAt < CACHE_TTL_MS) {
    return Promise.resolve(cachedRows);
  }

  if (!force && loadPromise) return loadPromise;

  loadPromise = loadFresh()
    .then((rows) => {
      cachedRows = rows;
      cacheAt = Date.now();
      return rows;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function clearContactShareCache(): void {
  cachedRows = null;
  cacheAt = 0;
  loadPromise = null;
}
