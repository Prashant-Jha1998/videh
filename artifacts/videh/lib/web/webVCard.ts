import { parseContactMessage } from "../contactMessage";

export function buildVCard(name: string, phones: string[], emails: string[] = []): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${name.replace(/\n/g, " ")}`];
  for (const p of phones) {
    if (p.trim()) lines.push(`TEL;TYPE=CELL:${p.trim()}`);
  }
  for (const e of emails) {
    if (e.trim()) lines.push(`EMAIL:${e.trim()}`);
  }
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export function downloadVCardFile(vcard: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([vcard], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".vcf") ? filename : `${filename}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function downloadContactVCardFromMessage(text: string): { ok: true } | { ok: false; message: string } {
  const parsed = parseContactMessage(text);
  if (!parsed) return { ok: false, message: "Invalid contact." };
  const safeName = parsed.name.replace(/[^\w.\- ]+/g, "_").trim() || "contact";
  downloadVCardFile(buildVCard(parsed.name, parsed.phones, parsed.emails ?? []), `${safeName}.vcf`);
  return { ok: true };
}
