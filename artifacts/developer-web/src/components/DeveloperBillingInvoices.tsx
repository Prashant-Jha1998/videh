import { ArrowLeft, Download, Loader2, RefreshCw } from "lucide-react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}
import { useCallback, useEffect, useState } from "react";
import { devFetch } from "../lib/devFetch";
import { formatInrRupees } from "../lib/billingDisplay";
import { getRazorpayLogoUrl } from "../lib/razorpayCheckout";

export type DeveloperInvoice = {
  id: number;
  bill_number: string;
  bill_date: string;
  due_date: string;
  amount_inr: number;
  status: string;
  period_key: string;
  is_current: boolean;
  paid_at: string | null;
};

type Props = {
  leadId: string;
  reference: string;
  companyName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  filter: "all" | "current";
  onBack: () => void;
  onPaid: () => void;
  onError: (msg: string) => void;
};

function statusLabel(status: string): string {
  if (status === "paid") return "Paid";
  if (status === "overdue") return "Unpaid";
  return status === "unpaid" ? "Unpaid" : status;
}

function statusClass(status: string): string {
  if (status === "paid") return "bg-[#d1fae5] text-[#065f46]";
  return "bg-[#fee2e2] text-[#991b1b]";
}

export function DeveloperBillingInvoices({
  leadId,
  reference,
  companyName,
  contactName,
  contactEmail,
  contactPhone,
  filter,
  onBack,
  onPaid,
  onError,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<DeveloperInvoice[]>([]);

  const qs = reference ? `?reference=${encodeURIComponent(reference)}` : "";

  const load = useCallback(async () => {
    if (!leadId) return;
    setBusy(true);
    onError("");
    try {
      const r = await devFetch(`/api/developer-leads/${leadId}/invoices${qs}`);
      const d = (await r.json()) as {
        success?: boolean;
        invoices?: DeveloperInvoice[];
        message?: string;
      };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Could not load bills");
      setInvoices(d.invoices ?? []);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [leadId, qs, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible =
    filter === "current" ? invoices.filter((i) => i.is_current) : invoices;

  async function downloadBill(inv: DeveloperInvoice) {
    const url = `/api/developer-leads/${leadId}/invoices/${inv.id}/download${qs}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function payBill(inv: DeveloperInvoice) {
    if (!leadId || inv.status === "paid") return;
    setPayingId(inv.id);
    onError("");
    try {
      const r = await devFetch(`/api/developer-leads/${leadId}/invoices/${inv.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const d = (await r.json()) as {
        success?: boolean;
        needsPayment?: boolean;
        checkout?: {
          orderId: string;
          amountInr: number;
          keyId: string;
          currency: string;
          logoUrl?: string;
          invoiceId: number;
          billNumber: string;
        };
        message?: string;
      };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Payment start failed");
      if (d.needsPayment && d.checkout) {
        await openInvoiceRazorpay(d.checkout);
        await load();
        onPaid();
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setPayingId(null);
    }
  }

  function openInvoiceRazorpay(checkout: {
    orderId: string;
    amountInr: number;
    keyId: string;
    currency: string;
    logoUrl?: string;
    invoiceId: number;
    billNumber: string;
  }) {
    return new Promise<void>((resolve, reject) => {
      if (!window.Razorpay) {
        reject(new Error("Payment gateway not loaded"));
        return;
      }
      const rzp = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amountInr * 100,
        currency: checkout.currency,
        name: "Videh",
        image: getRazorpayLogoUrl(checkout.logoUrl),
        description: `Invoice ${checkout.billNumber} — ${formatInrRupees(checkout.amountInr)}`,
        order_id: checkout.orderId,
        prefill: {
          name: contactName ?? companyName,
          email: contactEmail,
          contact: contactPhone,
        },
        theme: { color: "#00a884" },
        method: { card: true, upi: true, netbanking: true },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verify = await devFetch(`/api/developer-leads/${leadId}/invoices/verify-payment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reference,
                invoiceId: checkout.invoiceId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            const data = (await verify.json()) as { success?: boolean; message?: string };
            if (!verify.ok || !data.success) throw new Error(data.message ?? "Verification failed");
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
      });
      rzp.open();
    });
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#00a884] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to usage
      </button>

      <h3 className="text-lg font-bold text-[#111b21]">
        {filter === "current" ? "Current bill" : "Previous bills"}
      </h3>

      <button
        type="button"
        disabled={busy}
        onClick={() => void load()}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#00a884] hover:underline disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Refresh
      </button>

      {visible.length === 0 && !busy ? (
        <p className="text-sm text-[#667781] rounded-xl bg-[#f0f2f5] p-4">
          {filter === "current"
            ? "No bill for this month yet. Usage will appear here once your account is active."
            : "No previous bills on file yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-[#f0f2f5] text-left text-xs uppercase tracking-wide text-[#667781]">
              <tr>
                <th className="px-4 py-3 font-semibold">Bill No</th>
                <th className="px-4 py-3 font-semibold">Bill date</th>
                <th className="px-4 py-3 font-semibold">Due date</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((inv) => {
                const unpaid = inv.status !== "paid";
                return (
                  <tr key={inv.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-mono text-[#00a884]">{inv.bill_number}</td>
                    <td className="px-4 py-3">{inv.bill_date}</td>
                    <td className="px-4 py-3">{inv.due_date}</td>
                    <td className="px-4 py-3 font-semibold">{formatInrRupees(inv.amount_inr)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-bold ${statusClass(inv.status)}`}
                      >
                        {statusLabel(inv.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void downloadBill(inv)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#00a884] hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download bill
                        </button>
                        {unpaid ? (
                          <button
                            type="button"
                            disabled={payingId === inv.id}
                            onClick={() => void payBill(inv)}
                            className="rounded-lg bg-[#00a884] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#008f72] disabled:opacity-60"
                          >
                            {payingId === inv.id ? "Processing…" : "Pay"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[#667781]">
        Download opens a printable invoice (use Print → Save as PDF in your browser for a PDF copy).
      </p>
    </div>
  );
}
