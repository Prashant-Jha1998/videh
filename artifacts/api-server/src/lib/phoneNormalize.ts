/** Match mobile client `normalizePhone` in artifacts/videh/lib/videhContacts.ts */
export function normalizePhone(raw: string): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("91") && digits.length === 13) return `+${digits.slice(1)}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}
