import { query } from "./db";
import { getDeveloperApiUsageSnapshot } from "./developerApiUsage";
import {
  ensureDeveloperInvoicesTable,
  ensureSequentialBillNumbers,
  formatInvoiceDateOnly,
  invoiceToPublic,
} from "./developerInvoices";

export type AdminBillingPaymentRow = {
  id: number;
  event_type: string;
  event_label: string;
  amount_inr: number;
  status: string;
  razorpay_payment_id: string | null;
  created_at: string;
  payer_name: string;
  payer_email: string;
  bill_number?: string;
};

export type AdminBillingHistory = {
  payer: {
    contact_name: string;
    email: string;
    phone: string;
    company_name: string;
    reference_code: string;
  };
  usage: {
    messages_sent_month: number;
    messages_sent_total: number;
    api_hits_month: number;
    api_hits_total: number;
    usage_inr_month: number;
    platform_plan_inr_month: number;
    estimated_monthly_bill_inr: number;
    conv_user_initiated_month: number;
    conv_business_marketing_month: number;
    conv_business_utility_month: number;
    conv_business_auth_month: number;
    conv_business_service_month: number;
    conv_free_user_used_month: number;
    plan_id: string;
    total_billed_inr: number;
    last_payment_at: string | null;
  };
  payments: AdminBillingPaymentRow[];
  invoices: ReturnType<typeof invoiceToPublic>[];
};

function eventLabel(eventType: string): string {
  if (eventType === "payment_method_verification") return "Payment method verification";
  if (eventType === "monthly_invoice") return "Monthly invoice payment";
  return eventType.replace(/_/g, " ");
}

export async function getAdminBillingHistoryForAccount(accountId: number): Promise<AdminBillingHistory | null> {
  await ensureDeveloperInvoicesTable();
  const acct = await query(
    `SELECT a.*, l.contact_name, l.email, l.phone, l.company_name, l.reference_code,
            l.paid_at AS lead_paid_at, l.amount_inr AS lead_payment_inr, l.razorpay_payment_id AS lead_payment_id,
            l.payment_status, l.payment_method
     FROM developer_api_accounts a
     JOIN developer_leads l ON l.id = a.lead_id
     WHERE a.id = $1`,
    [accountId],
  );
  const row = acct.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const usageSnap = await getDeveloperApiUsageSnapshot(accountId, row);

  const events = await query(
    `SELECT e.id, e.event_type, e.amount_inr, e.status, e.razorpay_payment_id, e.metadata, e.created_at
     FROM developer_billing_events e
     WHERE e.account_id = $1
     ORDER BY e.created_at DESC
     LIMIT 100`,
    [accountId],
  );

  const payments: AdminBillingPaymentRow[] = events.rows.map((e) => {
    const ev = e as {
      id: number;
      event_type: string;
      amount_inr: number;
      status: string;
      razorpay_payment_id: string | null;
      metadata: { bill_number?: string } | string | null;
      created_at: string;
    };
    let meta: { bill_number?: string } = {};
    if (ev.metadata && typeof ev.metadata === "object") meta = ev.metadata;
    else if (typeof ev.metadata === "string") {
      try {
        meta = JSON.parse(ev.metadata) as { bill_number?: string };
      } catch {
        meta = {};
      }
    }
    return {
      id: ev.id,
      event_type: ev.event_type,
      event_label: eventLabel(ev.event_type),
      amount_inr: Number(ev.amount_inr) || 0,
      status: ev.status,
      razorpay_payment_id: ev.razorpay_payment_id,
      created_at: String(ev.created_at),
      payer_name: String(row.contact_name ?? row.company_name ?? ""),
      payer_email: String(row.email ?? ""),
      bill_number: meta.bill_number,
    };
  });

  const leadPaidAt = row.lead_paid_at ? String(row.lead_paid_at) : null;
  const leadPaymentId = row.lead_payment_id ? String(row.lead_payment_id) : null;
  if (
    leadPaidAt &&
    leadPaymentId &&
    !payments.some((p) => p.razorpay_payment_id === leadPaymentId)
  ) {
    payments.push({
      id: 0,
      event_type: "onboarding_payment",
      event_label: "Onboarding payment (lead)",
      amount_inr: Number(row.lead_payment_inr) || 5,
      status: String(row.payment_status ?? "verified"),
      razorpay_payment_id: leadPaymentId,
      created_at: leadPaidAt,
      payer_name: String(row.contact_name ?? ""),
      payer_email: String(row.email ?? ""),
    });
    payments.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  await ensureSequentialBillNumbers(accountId, String(row.reference_code ?? ""));
  const invRows = await query(
    `SELECT * FROM developer_invoices WHERE account_id = $1
     ORDER BY CASE WHEN status = 'paid' THEN 1 ELSE 0 END ASC, bill_date DESC`,
    [accountId],
  );

  return {
    payer: {
      contact_name: String(row.contact_name ?? ""),
      email: String(row.email ?? ""),
      phone: String(row.phone ?? ""),
      company_name: String(row.company_name ?? ""),
      reference_code: String(row.reference_code ?? ""),
    },
    usage: {
      messages_sent_month: Number(row.messages_sent_month ?? 0),
      messages_sent_total: Number(row.messages_sent_total ?? 0),
      api_hits_month: usageSnap.api_hits_month,
      api_hits_total: usageSnap.api_hits_total,
      usage_inr_month: usageSnap.api_usage_inr_month,
      platform_plan_inr_month: usageSnap.platform_plan_inr_month,
      estimated_monthly_bill_inr: usageSnap.estimated_monthly_bill_inr,
      conv_user_initiated_month: Number(row.conv_user_initiated_month ?? 0),
      conv_business_marketing_month: Number(row.conv_business_marketing_month ?? 0),
      conv_business_utility_month: Number(row.conv_business_utility_month ?? 0),
      conv_business_auth_month: Number(row.conv_business_auth_month ?? 0),
      conv_business_service_month: Number(row.conv_business_service_month ?? 0),
      conv_free_user_used_month: Number(row.conv_free_user_used_month ?? 0),
      plan_id: String(row.plan_id ?? ""),
      total_billed_inr: Number(row.total_billed_inr ?? 0),
      last_payment_at: row.last_payment_at ? String(row.last_payment_at) : null,
    },
    payments,
    invoices: invRows.rows.map((inv) =>
      invoiceToPublic(inv as Parameters<typeof invoiceToPublic>[0]),
    ),
  };
}

export function formatAdminTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  return formatInvoiceDateOnly(s) || s.slice(0, 16);
}
