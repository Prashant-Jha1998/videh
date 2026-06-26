import { ArrowLeft, ChevronLeft, ChevronRight, Download, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { devFetch } from "../lib/devFetch";
import { formatBillDate, formatInrRupees } from "../lib/billingDisplay";
import { getRazorpayLogoUrl } from "../lib/razorpayCheckout";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

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

const INVOICES_PER_PAGE = 10;

type InvoicePagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
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
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<DeveloperInvoice[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<InvoicePagination>({
    page: 1,
    limit: INVOICES_PER_PAGE,
    total: 0,
    total_pages: 0,
  });

  const load = useCallback(async () => {
    if (!leadId) return;
    setBusy(true);
    onError("");
    try {
      const params = new URLSearchParams();
      if (reference) params.set("reference", reference);
      if (filter === "current") {
        params.set("filter", "current");
      } else {
        params.set("page", String(page));
        params.set("limit", String(INVOICES_PER_PAGE));
      }
      const query = params.toString();
      const r = await devFetch(`/api/developer-leads/${leadId}/invoices${query ? `?${query}` : ""}`);
      const d = (await r.json()) as {
        success?: boolean;
        invoices?: DeveloperInvoice[];
        pagination?: InvoicePagination;
        message?: string;
      };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Could not load bills");
      setInvoices(d.invoices ?? []);
      setPagination(
        d.pagination ?? {
          page: 1,
          limit: INVOICES_PER_PAGE,
          total: d.invoices?.length ?? 0,
          total_pages: d.invoices?.length ? 1 : 0,
        },
      );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [leadId, reference, filter, page, onError]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadBillPdf(inv: DeveloperInvoice) {
    setDownloadingId(inv.id);
    onError("");
    try {
      const r = await devFetch(`/api/developer-leads/${leadId}/invoices/${inv.id}/download${qs}`);
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { message?: string };
        throw new Error(d.message ?? "Download failed");
      }
      const blob = await r.blob();
      if (!blob.type.includes("pdf")) {
        throw new Error("Server did not return a PDF. Redeploy api-server with the latest build.");
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.bill_number.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
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
        theme: { color: "#5B4FE8" },
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
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#5B4FE8] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to usage
      </button>

      <h3 className="text-lg font-bold text-[#14131F]">
        {filter === "current" ? "Current bill" : "Previous bills"}
      </h3>
      <p className="text-xs text-[#667781]">Unpaid bills appear first, then paid bills (by date).</p>

      <button
        type="button"
        disabled={busy}
        onClick={() => void load()}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#5B4FE8] hover:underline disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Refresh
      </button>

      {invoices.length === 0 && !busy ? (
        <p className="text-sm text-[#667781] rounded-xl bg-[#f0f2f5] p-4">
          {filter === "current"
            ? "No bill for this month yet. Usage will appear here once your account is active."
            : "No previous bills on file yet."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 w-full">
          <table className="w-full text-sm">
            <thead className="bg-[#f0f2f5] text-left text-xs uppercase tracking-wide text-[#667781]">
              <tr>
                <th className="px-3 py-3 font-semibold text-center">S.No</th>
                <th className="px-3 py-3 font-semibold">Bill No</th>
                <th className="px-3 py-3 font-semibold whitespace-nowrap">Bill date</th>
                <th className="px-3 py-3 font-semibold whitespace-nowrap">Due date</th>
                <th className="px-3 py-3 font-semibold whitespace-nowrap">Amount</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, index) => {
                const unpaid = inv.status !== "paid";
                const serialNo =
                  filter === "all"
                    ? (pagination.page - 1) * INVOICES_PER_PAGE + index + 1
                    : index + 1;
                return (
                  <tr key={inv.id} className="border-t border-gray-100 align-middle">
                    <td className="px-3 py-3 text-center text-[#667781] font-medium">{serialNo}</td>
                    <td className="px-3 py-3 font-mono text-xs text-[#5B4FE8] break-all">{inv.bill_number}</td>
                    <td className="px-3 py-3 whitespace-nowrap tabular-nums">{formatBillDate(inv.bill_date)}</td>
                    <td className="px-3 py-3 whitespace-nowrap tabular-nums">{formatBillDate(inv.due_date)}</td>
                    <td className="px-3 py-3 font-semibold whitespace-nowrap">{formatInrRupees(inv.amount_inr)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-block whitespace-nowrap px-2.5 py-0.5 rounded-md text-xs font-bold ${statusClass(inv.status)}`}
                      >
                        {statusLabel(inv.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-nowrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={downloadingId === inv.id}
                          onClick={() => void downloadBillPdf(inv)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#5B4FE8]/40 px-2.5 py-1.5 text-xs font-semibold text-[#5B4FE8] hover:bg-[#e7f9f3] disabled:opacity-60"
                        >
                          {downloadingId === inv.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          PDF
                        </button>
                        {unpaid ? (
                          <button
                            type="button"
                            disabled={payingId === inv.id}
                            onClick={() => void payBill(inv)}
                            className="shrink-0 rounded-lg bg-[#5B4FE8] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#008f72] disabled:opacity-60 whitespace-nowrap"
                          >
                            {payingId === inv.id ? "…" : "Pay"}
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

      {filter === "all" && pagination.total_pages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-[#f9fafb] px-4 py-3">
          <p className="text-xs text-[#667781]">
            Showing {(pagination.page - 1) * INVOICES_PER_PAGE + 1}–
            {Math.min(pagination.page * INVOICES_PER_PAGE, pagination.total)} of {pagination.total} invoices
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#14131F] hover:bg-[#f0f2f5] disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="text-xs font-semibold text-[#667781] tabular-nums">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <button
              type="button"
              disabled={busy || pagination.page >= pagination.total_pages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#14131F] hover:bg-[#f0f2f5] disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
