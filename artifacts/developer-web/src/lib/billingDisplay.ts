import type { PortalAccount } from "../hooks/useDeveloperPortal";

export function formatInrRupees(amount: number): string {
  if (!Number.isFinite(amount)) return "₹0";
  return amount % 1 === 0 ? `₹${amount}` : `₹${amount.toFixed(2)}`;
}

/** usage_billing_month_inr is stored in paise on the server. */
export function usageMonthInr(account: PortalAccount): number {
  if (typeof account.api_usage_inr_month === "number") return account.api_usage_inr_month;
  return Math.round(Number(account.usage_billing_month_inr ?? 0)) / 100;
}

export function estimatedMonthlyBillInr(account: PortalAccount): number {
  if (typeof account.estimated_monthly_bill_inr === "number") return account.estimated_monthly_bill_inr;
  return Number(account.amount_inr_monthly ?? 0) + usageMonthInr(account);
}

/** Bill table dates: YYYY-MM-DD only (strips ISO timezone from API). */
export function formatBillDate(value: string | null | undefined): string {
  if (!value) return "—";
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1]!;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

export function sortInvoicesForDisplay<T extends { status: string; bill_date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aPaid = a.status === "paid" ? 1 : 0;
    const bPaid = b.status === "paid" ? 1 : 0;
    if (aPaid !== bPaid) return aPaid - bPaid;
    return formatBillDate(b.bill_date).localeCompare(formatBillDate(a.bill_date));
  });
}
