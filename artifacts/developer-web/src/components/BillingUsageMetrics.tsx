import type { PortalAccount } from "../hooks/useDeveloperPortal";
import { estimatedMonthlyBillInr, formatInrRupees, usageMonthInr } from "../lib/billingDisplay";

type Props = { account: PortalAccount };

export function BillingUsageMetrics({ account }: Props) {
  const apiHitsMonth = account.api_hits_month ?? account.messages_sent_month ?? 0;
  const apiHitsTotal = account.api_hits_total ?? account.messages_sent_total ?? 0;
  const usageInr = usageMonthInr(account);
  const estimatedBill = estimatedMonthlyBillInr(account);
  const delivered = account.messages_delivered_month ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-xl border-2 border-[#5B4FE8]/30 bg-[#e7f9f3] p-4">
          <p className="text-xs font-semibold text-[#5B4FE8] uppercase tracking-wide">API hits (month)</p>
          <p className="text-3xl font-bold text-[#14131F] mt-1">{apiHitsMonth}</p>
          <p className="text-[11px] text-[#667781] mt-1">POST /v1/business-messages calls this month</p>
        </div>
        <div className="rounded-xl border-2 border-[#5B4FE8]/30 bg-[#e7f9f3] p-4">
          <p className="text-xs font-semibold text-[#5B4FE8] uppercase tracking-wide">API usage (month)</p>
          <p className="text-3xl font-bold text-[#14131F] mt-1">{formatInrRupees(usageInr)}</p>
          <p className="text-[11px] text-[#667781] mt-1">Conversation charges added to your bill</p>
        </div>
        <div className="rounded-xl border-2 border-[#14131F]/10 bg-[#f0f2f5] p-4">
          <p className="text-xs font-semibold text-[#667781] uppercase tracking-wide">Est. monthly bill</p>
          <p className="text-3xl font-bold text-[#14131F] mt-1">{formatInrRupees(estimatedBill)}</p>
          <p className="text-[11px] text-[#667781] mt-1">
            Plan {formatInrRupees(Number(account.amount_inr_monthly ?? 0))} + API usage {formatInrRupees(usageInr)}
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-xl bg-[#f0f2f5] p-4">
          <p className="text-xs text-[#667781]">API hits (all time)</p>
          <p className="text-xl font-bold text-[#14131F]">{apiHitsTotal}</p>
        </div>
        <div className="rounded-xl bg-[#f0f2f5] p-4">
          <p className="text-xs text-[#667781]">Messages delivered (month)</p>
          <p className="text-xl font-bold text-[#14131F]">{delivered}</p>
        </div>
        <div className="rounded-xl bg-[#f0f2f5] p-4">
          <p className="text-xs text-[#667781]">Billing status</p>
          <p className="text-lg font-bold text-[#14131F]">{account.billing_status}</p>
        </div>
        <div className="rounded-xl bg-[#f0f2f5] p-4">
          <p className="text-xs text-[#667781]">Platform plan / mo</p>
          <p className="text-xl font-bold text-[#14131F]">
            {account.amount_inr_monthly ? formatInrRupees(Number(account.amount_inr_monthly)) : account.plan_id ?? "—"}
          </p>
        </div>
        <div className="rounded-xl bg-[#f0f2f5] p-4">
          <p className="text-xs text-[#667781]">Total paid (lifetime)</p>
          <p className="text-xl font-bold text-[#14131F]">{formatInrRupees(Number(account.total_billed_inr ?? 0))}</p>
        </div>
      </div>

      <p className="text-xs text-[#667781]">
        Conversations billed this month — user-initiated: {account.conv_user_initiated_month ?? 0}, marketing:{" "}
        {account.conv_business_marketing_month ?? 0}, utility: {account.conv_business_utility_month ?? 0}, auth:{" "}
        {account.conv_business_auth_month ?? 0}, service: {account.conv_business_service_month ?? 0}, free tier used:{" "}
        {account.conv_free_user_used_month ?? 0}
      </p>
    </div>
  );
}
