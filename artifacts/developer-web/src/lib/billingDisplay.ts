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
