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

function currentPeriodKey(): string {
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

function billNumberFor(accountId: number, periodKey: string, referenceCode?: string): string {
  const ref = (referenceCode ?? "VIDH").replace(/[^A-Z0-9-]/gi, "").slice(0, 12);
  return `${ref}-INV-${periodKey.replace("-", "")}`;
}

export function invoiceToPublic(row: DeveloperInvoiceRow) {
  const today = new Date().toISOString().slice(0, 10);
  let status = row.status;
  if (status === "unpaid" && row.due_date < today) status = "overdue";
  return {
    id: row.id,
    bill_number: row.bill_number,
    bill_date: row.bill_date,
    due_date: row.due_date,
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
  const billNumber = billNumberFor(accountId, periodKey, referenceCode);

  const existing = await query(
    `SELECT * FROM developer_invoices WHERE account_id = $1 AND period_key = $2`,
    [accountId, periodKey],
  );
  const row = existing.rows[0] as DeveloperInvoiceRow | undefined;
  if (row?.status === "paid") {
    return row;
  }

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

export async function listInvoicesForAccount(accountId: number): Promise<DeveloperInvoiceRow[]> {
  await ensureDeveloperInvoicesTable();
  const r = await query(
    `SELECT * FROM developer_invoices WHERE account_id = $1 ORDER BY bill_date DESC, id DESC`,
    [accountId],
  );
  return r.rows as DeveloperInvoiceRow[];
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

export function buildInvoiceHtml(inv: DeveloperInvoiceRow, companyName: string): string {
  const status =
    inv.status === "paid"
      ? "PAID"
      : inv.due_date < new Date().toISOString().slice(0, 10)
        ? "OVERDUE"
        : "UNPAID";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${inv.bill_number}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;padding:40px;color:#111b21;max-width:720px;margin:0 auto}
  h1{color:#00a884;font-size:22px} table{width:100%;border-collapse:collapse;margin:16px 0}
  td,th{padding:10px 12px;border-bottom:1px solid #e9edef;text-align:left}
  .amt{text-align:right;font-weight:600} .tag{display:inline-block;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:700}
  .paid{background:#d1fae5;color:#065f46}.unpaid{background:#fee2e2;color:#991b1b}
</style></head><body>
<h1>Videh Business API — Tax Invoice</h1>
<p><strong>${companyName}</strong></p>
<p>Bill No: <strong>${inv.bill_number}</strong><br/>
Period: ${inv.period_key}<br/>
Bill Date: ${inv.bill_date}<br/>
Due Date: ${inv.due_date}<br/>
Status: <span class="tag ${inv.status === "paid" ? "paid" : "unpaid"}">${status}</span></p>
<table>
<tr><th>Description</th><th class="amt">Amount (INR)</th></tr>
<tr><td>Platform plan (monthly)</td><td class="amt">₹${inv.plan_inr}</td></tr>
<tr><td>API usage (conversations)</td><td class="amt">₹${inv.usage_inr}</td></tr>
<tr><th>Total</th><th class="amt">₹${inv.amount_inr}</th></tr>
</table>
<p style="color:#667781;font-size:12px">Videh · developer@videh.co.in · This document was generated from your developer console.</p>
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
}
