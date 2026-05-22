import { query } from "./db";
import { ensureDeveloperTemplateTables } from "./developerTemplates";

export type DeveloperApiUsageSnapshot = {
  api_hits_month: number;
  api_hits_total: number;
  api_usage_inr_month: number;
  platform_plan_inr_month: number;
  estimated_monthly_bill_inr: number;
  messages_delivered_month: number;
};

/** Usage metrics for developer portal billing panel (API hits + billable usage). */
export async function getDeveloperApiUsageSnapshot(
  accountId: number,
  accountRow: Record<string, unknown>,
): Promise<DeveloperApiUsageSnapshot> {
  await ensureDeveloperTemplateTables();

  const [monthHits, totalHits, deliveredMonth] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS c FROM developer_api_messages
       WHERE account_id = $1 AND created_at >= date_trunc('month', NOW())`,
      [accountId],
    ),
    query(
      `SELECT COUNT(*)::int AS c FROM developer_api_messages WHERE account_id = $1`,
      [accountId],
    ),
    query(
      `SELECT COUNT(*)::int AS c FROM developer_api_messages
       WHERE account_id = $1 AND status = 'sent' AND created_at >= date_trunc('month', NOW())`,
      [accountId],
    ),
  ]);

  const usagePaise = Number(accountRow.usage_billing_month_inr ?? 0);
  const apiUsageInr = Math.round(usagePaise) / 100;
  const planInr = Number(accountRow.amount_inr_monthly ?? 0);

  return {
    api_hits_month: Number((monthHits.rows[0] as { c?: number })?.c ?? 0),
    api_hits_total: Number((totalHits.rows[0] as { c?: number })?.c ?? 0),
    api_usage_inr_month: apiUsageInr,
    platform_plan_inr_month: planInr,
    estimated_monthly_bill_inr: planInr + apiUsageInr,
    messages_delivered_month: Number((deliveredMonth.rows[0] as { c?: number })?.c ?? 0),
  };
}
