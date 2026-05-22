import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "./db";

const apiServerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function unlinkUploadUrl(url: string | null | undefined): void {
  if (!url || !url.startsWith("/uploads/")) return;
  const abs = path.join(apiServerDir, url.replace(/^\//, "").replace(/\//g, path.sep));
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    /* ignore missing files */
  }
}

/** Permanently removes a developer application and cascaded rows; deletes uploaded files on disk. */
export async function deleteDeveloperLeadById(leadId: number): Promise<boolean> {
  const lead = await query(`SELECT id, logo_url FROM developer_leads WHERE id = $1`, [leadId]);
  if (!lead.rows[0]) return false;

  const docs = await query(`SELECT file_path FROM developer_lead_documents WHERE lead_id = $1`, [leadId]);
  for (const row of docs.rows as { file_path?: string }[]) {
    unlinkUploadUrl(row.file_path);
  }
  unlinkUploadUrl((lead.rows[0] as { logo_url?: string }).logo_url);

  await query(`DELETE FROM developer_leads WHERE id = $1`, [leadId]);
  return true;
}
