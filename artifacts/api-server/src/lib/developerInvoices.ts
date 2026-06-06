import { query } from "./db";
import { getDeveloperApiUsageSnapshot } from "./developerApiUsage";

export type DeveloperInvoiceRow = {
  id: number;
  account_id: number;
  bill_number: string;
  period_key: string;
  bill_date: string;
  due_date: string;
  plan_inr: number;
  usage_inr: number;
  amount_inr: number;
  status: string;
  razorpay_order_id: string | null;
  paid_at: string | null;
  created_at: string;
};

let tableReady = false;

export async function ensureDeveloperInvoicesTable(): Promise<void> {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS developer_invoices (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES developer_api_accounts(id) ON DELETE CASCADE,
      bill_number TEXT NOT NULL UNIQUE,
      period_key TEXT NOT NULL,
      bill_date DATE NOT NULL,
      due_date DATE NOT NULL,
      plan_inr INTEGER NOT NULL DEFAULT 0,
      usage_inr INTEGER NOT NULL DEFAULT 0,
      amount_inr INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unpaid',
      razorpay_order_id TEXT,
      razorpay_payment_id TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (account_id, period_key)
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS idx_dev_invoices_account ON developer_invoices(account_id, bill_date DESC)`,
  );
  tableReady = true;
}

export function currentPeriodKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function periodBounds(periodKey: string): { billDate: string; dueDate: string } {
  const [y, m] = periodKey.split("-").map(Number);
  const billDate = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const due = new Date(Date.UTC(y, m - 1, lastDay));
  due.setUTCDate(due.getUTCDate() + 15);
  const dueDate = due.toISOString().slice(0, 10);
  return { billDate, dueDate };
}

function billNumberPrefix(referenceCode?: string): string {
  const ref = (referenceCode ?? "VIDH").replace(/[^A-Z0-9-]/gi, "").toUpperCase().slice(0, 12);
  return `${ref}-INV`;
}

function billNumberForSequence(referenceCode: string | undefined, sequence: number): string {
  return `${billNumberPrefix(referenceCode)}-${String(sequence).padStart(6, "0")}`;
}

/** Assign stable sequential bill numbers per account (000001, 000002, …). */
export async function ensureSequentialBillNumbers(
  accountId: number,
  referenceCode?: string,
): Promise<void> {
  await ensureDeveloperInvoicesTable();
  const rows = await query(
    `SELECT id, bill_number FROM developer_invoices
     WHERE account_id = $1
     ORDER BY bill_date ASC, id ASC`,
    [accountId],
  );
  for (let i = 0; i < rows.rows.length; i++) {
    const row = rows.rows[i] as { id: number; bill_number: string };
    const expected = billNumberForSequence(referenceCode, i + 1);
    if (row.bill_number !== expected) {
      await query(`UPDATE developer_invoices SET bill_number = $1, updated_at = NOW() WHERE id = $2`, [
        expected,
        row.id,
      ]);
    }
  }
}

async function nextBillSequence(accountId: number): Promise<number> {
  const r = await query(`SELECT COUNT(*)::int AS c FROM developer_invoices WHERE account_id = $1`, [accountId]);
  return Number(r.rows[0]?.c ?? 0) + 1;
}

/** Normalize DB DATE / timestamps to YYYY-MM-DD (no timezone in API/UI). */
export function formatInvoiceDateOnly(value: string | Date | null | undefined): string {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1]!;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

export function invoiceToPublic(row: DeveloperInvoiceRow) {
  const billDate = formatInvoiceDateOnly(row.bill_date);
  const dueDate = formatInvoiceDateOnly(row.due_date);
  const today = new Date().toISOString().slice(0, 10);
  let status = row.status;
  if (status === "unpaid" && dueDate < today) status = "overdue";
  return {
    id: row.id,
    bill_number: row.bill_number,
    bill_date: billDate,
    due_date: dueDate,
    plan_inr: row.plan_inr,
    usage_inr: row.usage_inr,
    amount_inr: row.amount_inr,
    status,
    period_key: row.period_key,
    is_current: row.period_key === currentPeriodKey(),
    paid_at: row.paid_at,
  };
}

export async function syncCurrentMonthInvoice(
  accountId: number,
  accountRow: Record<string, unknown>,
  referenceCode?: string,
): Promise<DeveloperInvoiceRow> {
  await ensureDeveloperInvoicesTable();
  const usage = await getDeveloperApiUsageSnapshot(accountId, accountRow);
  const periodKey = currentPeriodKey();
  const planInr = Math.round(Number(accountRow.amount_inr_monthly ?? 0));
  const usageInr = Math.round(usage.api_usage_inr_month);
  const amountInr = planInr + usageInr;
  const { billDate, dueDate } = periodBounds(periodKey);
  await ensureSequentialBillNumbers(accountId, referenceCode);

  const existing = await query(
    `SELECT * FROM developer_invoices WHERE account_id = $1 AND period_key = $2`,
    [accountId, periodKey],
  );
  const row = existing.rows[0] as DeveloperInvoiceRow | undefined;
  if (row?.status === "paid") {
    return row;
  }

  const billNumber = billNumberForSequence(referenceCode, await nextBillSequence(accountId));

  const r = await query(
    `INSERT INTO developer_invoices
     (account_id, bill_number, period_key, bill_date, due_date, plan_inr, usage_inr, amount_inr, status, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unpaid',NOW())
     ON CONFLICT (account_id, period_key) DO UPDATE SET
       plan_inr = EXCLUDED.plan_inr,
       usage_inr = EXCLUDED.usage_inr,
       amount_inr = EXCLUDED.amount_inr,
       bill_date = EXCLUDED.bill_date,
       due_date = EXCLUDED.due_date,
       updated_at = NOW()
     RETURNING *`,
    [accountId, billNumber, periodKey, billDate, dueDate, planInr, usageInr, amountInr],
  );
  return r.rows[0] as DeveloperInvoiceRow;
}

export type InvoiceListPage = {
  rows: DeveloperInvoiceRow[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

export async function listInvoicesForAccount(
  accountId: number,
  options?: { page?: number; limit?: number },
): Promise<InvoiceListPage> {
  await ensureDeveloperInvoicesTable();
  const page = Math.max(1, Math.floor(Number(options?.page ?? 1)));
  const limit = Math.min(50, Math.max(1, Math.floor(Number(options?.limit ?? 10))));
  const offset = (page - 1) * limit;

  const countR = await query(`SELECT COUNT(*)::int AS c FROM developer_invoices WHERE account_id = $1`, [
    accountId,
  ]);
  const total = Number(countR.rows[0]?.c ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  const r = await query(
    `SELECT * FROM developer_invoices WHERE account_id = $1
     ORDER BY CASE WHEN status = 'paid' THEN 1 ELSE 0 END ASC, bill_date DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [accountId, limit, offset],
  );
  return {
    rows: r.rows as DeveloperInvoiceRow[],
    total,
    page,
    limit,
    total_pages: totalPages,
  };
}

export async function getInvoiceForAccount(
  accountId: number,
  invoiceId: number,
): Promise<DeveloperInvoiceRow | null> {
  await ensureDeveloperInvoicesTable();
  const r = await query(`SELECT * FROM developer_invoices WHERE id = $1 AND account_id = $2`, [
    invoiceId,
    accountId,
  ]);
  return (r.rows[0] as DeveloperInvoiceRow) ?? null;
}

function invoiceStatusLabel(inv: DeveloperInvoiceRow): string {
  const dueDate = formatInvoiceDateOnly(inv.due_date);
  if (inv.status === "paid") return "PAID";
  if (dueDate < new Date().toISOString().slice(0, 10)) return "OVERDUE";
  return "UNPAID";
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Minimal PDF 1.4 generator (no external deps) for invoice download. */
export function buildInvoicePdf(inv: DeveloperInvoiceRow, companyName: string): Buffer {
  const billDate = formatInvoiceDateOnly(inv.bill_date);
  const dueDate = formatInvoiceDateOnly(inv.due_date);
  const status = invoiceStatusLabel(inv);

  const lines: { size: number; text: string; y: number }[] = [
    { size: 18, text: "Videh Business API - Tax Invoice", y: 740 },
    { size: 12, text: companyName.slice(0, 80), y: 712 },
    { size: 10, text: `Bill No: ${inv.bill_number}`, y: 680 },
    { size: 10, text: `Period: ${inv.period_key}`, y: 662 },
    { size: 10, text: `Bill Date: ${billDate}`, y: 644 },
    { size: 10, text: `Due Date: ${dueDate}`, y: 626 },
    { size: 10, text: `Status: ${status}`, y: 608 },
    { size: 10, text: "Description", y: 570 },
    { size: 10, text: "Amount (INR)", y: 570 },
    { size: 10, text: "Platform plan (monthly)", y: 548 },
    { size: 10, text: `Rs. ${inv.plan_inr}`, y: 548 },
    { size: 10, text: "API usage (conversations)", y: 526 },
    { size: 10, text: `Rs. ${inv.usage_inr}`, y: 526 },
    { size: 11, text: "Total", y: 500 },
    { size: 11, text: `Rs. ${inv.amount_inr}`, y: 500 },
    { size: 9, text: "Videh - developer@videh.co.in", y: 460 },
  ];

  const amountX = 480;
  const textOps = lines
    .map((line) => {
      const x = line.text.startsWith("Rs.") || line.text === "Amount (INR)" ? amountX : 48;
      return `/F1 ${line.size} Tf 1 0 0 1 ${x} ${line.y} Tm (${escapePdfText(line.text)}) Tj`;
    })
    .join("\n");

  const stream = `BT\n${textOps}\nET`;
  const streamLen = Buffer.byteLength(stream, "utf8");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export function buildInvoiceHtml(inv: DeveloperInvoiceRow, companyName: string): string {
  const billDate = formatInvoiceDateOnly(inv.bill_date);
  const dueDate = formatInvoiceDateOnly(inv.due_date);
  const status = invoiceStatusLabel(inv);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${inv.bill_number}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;padding:40px;color:#111b21;max-width:720px;margin:0 auto}
  h1{color:#00a884;font-size:22px;margin-bottom:8px}
  .meta{line-height:1.7;margin:16px 0}
  table{width:100%;border-collapse:collapse;margin:16px 0}
  td,th{padding:10px 12px;border-bottom:1px solid #e9edef;text-align:left}
  .amt{text-align:right;font-weight:600}
  .tag{display:inline-block;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700}
  .paid{background:#d1fae5;color:#065f46}.unpaid{background:#fee2e2;color:#991b1b}
  .toolbar{margin:20px 0;padding:12px;background:#f0f2f5;border-radius:8px;font-size:13px}
  .btn{background:#00a884;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-weight:700;cursor:pointer;margin-right:8px}
  @media print{.toolbar{display:none}}
</style></head><body>
<div class="toolbar no-print">
  <button type="button" class="btn" onclick="window.print()">Save as PDF / Print</button>
  <span>Use your browser print dialog and choose &quot;Save as PDF&quot;.</span>
</div>
<h1>Videh Business API — Tax Invoice</h1>
<p><strong>${companyName}</strong></p>
<div class="meta">
  Bill No: <strong>${inv.bill_number}</strong><br/>
  Period: ${inv.period_key}<br/>
  Bill Date: ${billDate}<br/>
  Due Date: ${dueDate}<br/>
  Status: <span class="tag ${inv.status === "paid" ? "paid" : "unpaid"}">${status}</span>
</div>
<table>
<tr><th>Description</th><th class="amt">Amount (INR)</th></tr>
<tr><td>Platform plan (monthly)</td><td class="amt">₹${inv.plan_inr}</td></tr>
<tr><td>API usage (conversations)</td><td class="amt">₹${inv.usage_inr}</td></tr>
<tr><th>Total</th><th class="amt">₹${inv.amount_inr}</th></tr>
</table>
<p style="color:#667781;font-size:12px">Videh · developer@videh.co.in</p>
</body></html>`;
}

export async function markInvoicePaid(
  invoiceId: number,
  accountId: number,
  razorpayPaymentId: string,
): Promise<void> {
  await query(
    `UPDATE developer_invoices SET status = 'paid', paid_at = NOW(), razorpay_payment_id = $1, updated_at = NOW()
     WHERE id = $2 AND account_id = $3`,
    [razorpayPaymentId, invoiceId, accountId],
  );
  await query(
    `UPDATE developer_api_accounts SET billing_status = 'active', last_payment_at = NOW(), total_billed_inr = total_billed_inr + (
       SELECT amount_inr FROM developer_invoices WHERE id = $1
     ) WHERE id = $2`,
    [invoiceId, accountId],
  );
  const today = new Date().toISOString().slice(0, 10);
  const stillOverdue = await query(
    `SELECT 1 FROM developer_invoices
     WHERE account_id = $1 AND status = 'unpaid' AND due_date < $2::date LIMIT 1`,
    [accountId, today],
  );
  if (stillOverdue.rows.length > 0) {
    await query(
      `UPDATE developer_api_accounts SET billing_status = 'hold', updated_at = NOW() WHERE id = $1`,
      [accountId],
    );
  }
}
