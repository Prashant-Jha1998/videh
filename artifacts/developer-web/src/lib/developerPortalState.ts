/** Lead has finished apply flow — use full-screen console (#apply), not landing #dashboard section */
export type ActiveLeadSummary = {
  status: string;
  wizard_step?: string;
  payment_method_verified?: boolean;
  has_api_account?: boolean;
};

export function isLeadConsoleReady(lead: ActiveLeadSummary | null | undefined): boolean {
  if (!lead) return false;
  if (lead.has_api_account) return true;
  if (lead.wizard_step === "done") return true;
  if (lead.payment_method_verified) return true;
  if (lead.status === "approved") return true;
  return !["draft", "payment_pending"].includes(lead.status);
}
