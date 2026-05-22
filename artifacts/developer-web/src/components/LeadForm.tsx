import { useEffect, useState, type FormEvent } from "react";
import { Building2, CreditCard, Loader2, Send } from "lucide-react";
import { getRazorpayLogoUrl } from "../lib/razorpayCheckout";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const ENTITY_TYPES = [
  { value: "pvt_ltd", label: "Private Limited (Pvt Ltd)" },
  { value: "llp", label: "LLP" },
  { value: "proprietorship", label: "Proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Other registered entity" },
] as const;

const USE_CASES = [
  "Transactional (OTP, orders, alerts)",
  "Marketing & promotions",
  "Customer support inbox",
  "All of the above",
] as const;

type Plan = { id: string; name: string; amountInr: number };

type FormState = {
  companyName: string;
  entityType: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  gstin: string;
  monthlyVolume: string;
  useCase: string;
  message: string;
  planId: string;
};

const initial: FormState = {
  companyName: "",
  entityType: "pvt_ltd",
  contactName: "",
  email: "",
  phone: "",
  website: "",
  gstin: "",
  monthlyVolume: "under_10k",
  useCase: USE_CASES[0],
  message: "",
  planId: "starter",
};

export function LeadForm() {
  const [form, setForm] = useState<FormState>(initial);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [reference, setReference] = useState("");

  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    fetch("/api/developer-leads")
      .then((r) => r.json())
      .then((d: { plans?: Plan[]; razorpayConfigured?: boolean }) => {
        if (d.plans?.length) setPlans(d.plans);
        setRazorpayReady(Boolean(d.razorpayConfigured && window.Razorpay));
      })
      .catch(() => {});
  }, []);

  const selectedPlan = plans.find((p) => p.id === form.planId) ?? { id: "starter", name: "Starter", amountInr: 2999 };

  async function openRazorpayCheckout(args: {
    leadId: number;
    checkout: { orderId: string; amountInr: number; keyId: string; currency: string; logoUrl?: string };
  }) {
    return new Promise<void>((resolve, reject) => {
      if (!window.Razorpay) {
        reject(new Error("Payment gateway not loaded. Refresh and try again."));
        return;
      }
      const rzp = new window.Razorpay({
        key: args.checkout.keyId,
        amount: args.checkout.amountInr * 100,
        currency: args.checkout.currency,
        name: "Videh",
        image: getRazorpayLogoUrl(args.checkout.logoUrl),
        description: `${selectedPlan.name} plan — API onboarding`,
        order_id: args.checkout.orderId,
        prefill: {
          name: form.contactName,
          email: form.email,
          contact: form.phone,
        },
        theme: { color: "#00a884" },
        method: { card: true, upi: true, netbanking: true },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verify = await fetch("/api/developer-leads/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                leadId: args.leadId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });
            const data = (await verify.json()) as { success?: boolean; message?: string };
            if (!verify.ok || !data.success) throw new Error(data.message ?? "Payment verification failed");
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        modal: {
          ondismiss: () => reject(new Error("Payment cancelled")),
        },
      });
      rzp.open();
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/developer-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        reference?: string;
        leadId?: number;
        needsPayment?: boolean;
        checkout?: { orderId: string; amountInr: number; keyId: string; currency: string };
      };
      if (!res.ok || !data.success) {
        throw new Error(data.message ?? "Submission failed");
      }

      setReference(data.reference ?? "");

      if (data.needsPayment && data.checkout && data.leadId) {
        if (!razorpayReady) {
          throw new Error("Card payment is not available. Contact developer@videh.co.in");
        }
        await openRazorpayCheckout({ leadId: data.leadId, checkout: data.checkout });
      }

      setStatus("ok");
      setForm(initial);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "ok") {
    return (
      <div className="rounded-2xl bg-white border border-[#00a884]/20 p-10 text-center shadow-lg">
        <div className="mx-auto h-14 w-14 rounded-full bg-[#00a884]/15 flex items-center justify-center text-[#00a884] mb-4">
          <Send className="h-7 w-7" />
        </div>
        <h3 className="text-xl font-bold text-[#111b21] mb-2">Application submitted</h3>
        {reference ? (
          <p className="text-sm font-mono text-[#00a884] mb-2">{reference}</p>
        ) : null}
        <p className="text-[#667781] max-w-md mx-auto">
          Payment verified. Your application is in the Videh admin queue for document review, channel
          setup, and template approval. We will contact you within 1–2 business days.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-6 text-sm font-semibold text-[#00a884] hover:underline"
        >
          Submit another application
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl bg-white border border-gray-200/80 p-6 md:p-8 shadow-xl shadow-black/5 space-y-5"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-[#00a884]/10 flex items-center justify-center text-[#00a884]">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-bold text-lg text-[#111b21]">Apply for Videh Business Messaging API</h3>
          <p className="text-sm text-[#667781]">Pay with debit/credit card · Admin approves each stage</p>
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-[#111b21]">Select plan *</span>
        <select
          required
          value={form.planId}
          onChange={(e) => set("planId", e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
        >
          {(plans.length ? plans : [
            { id: "starter", name: "Starter", amountInr: 2999 },
            { id: "growth", name: "Growth", amountInr: 9999 },
            { id: "enterprise", name: "Enterprise", amountInr: 0 },
          ]).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.amountInr > 0 ? `₹${p.amountInr.toLocaleString("en-IN")}/mo` : "Custom pricing"}
            </option>
          ))}
        </select>
      </label>

      {selectedPlan.amountInr > 0 ? (
        <div className="flex items-center gap-2 text-sm text-[#667781] bg-[#f0f2f5] rounded-xl px-4 py-3">
          <CreditCard className="h-4 w-4 text-[#00a884]" />
          On submit you will pay <strong className="text-[#111b21]">₹{selectedPlan.amountInr.toLocaleString("en-IN")}</strong> via
          debit/credit card (Razorpay). Then admin reviews your application.
        </div>
      ) : (
        <p className="text-sm text-[#667781] bg-[#f0f2f5] rounded-xl px-4 py-3">
          Enterprise plan — no online payment. Admin will contact you for custom agreement.
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <label className="block space-y-1.5 md:col-span-2">
          <span className="text-sm font-medium text-[#111b21]">Company legal name *</span>
          <input
            required
            value={form.companyName}
            onChange={(e) => set("companyName", e.target.value)}
            placeholder="Acme Solutions Pvt Ltd"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/40 focus:border-[#00a884]"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[#111b21]">Entity type *</span>
          <select
            required
            value={form.entityType}
            onChange={(e) => set("entityType", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[#111b21]">GSTIN (if registered)</span>
          <input
            value={form.gstin}
            onChange={(e) => set("gstin", e.target.value.toUpperCase())}
            placeholder="22AAAAA0000A1Z5"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[#111b21]">Contact person *</span>
          <input
            required
            value={form.contactName}
            onChange={(e) => set("contactName", e.target.value)}
            placeholder="Full name"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[#111b21]">Work email *</span>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[#111b21]">Business phone *</span>
          <input
            required
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[#111b21]">Website</span>
          <input
            value={form.website}
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://yourcompany.com"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-[#111b21]">Expected monthly messages</span>
          <select
            value={form.monthlyVolume}
            onChange={(e) => set("monthlyVolume", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
          >
            <option value="under_10k">Under 10,000</option>
            <option value="10k_50k">10,000 – 50,000</option>
            <option value="50k_200k">50,000 – 2,00,000</option>
            <option value="200k_plus">2,00,000+</option>
          </select>
        </label>

        <label className="block space-y-1.5 md:col-span-2">
          <span className="text-sm font-medium text-[#111b21]">Primary use case</span>
          <select
            value={form.useCase}
            onChange={(e) => set("useCase", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
          >
            {USE_CASES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5 md:col-span-2">
          <span className="text-sm font-medium text-[#111b21]">Tell us about your messaging needs</span>
          <textarea
            rows={3}
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
            placeholder="Order updates, OTP, marketing campaigns, support desk integration..."
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#00a884]/40"
          />
        </label>
      </div>

      {status === "error" && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white font-semibold py-3.5 transition-colors disabled:opacity-60"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            {selectedPlan.amountInr > 0 ? "Processing payment…" : "Submitting…"}
          </>
        ) : (
          <>
            {selectedPlan.amountInr > 0 ? <CreditCard className="h-5 w-5" /> : <Send className="h-5 w-5" />}
            {selectedPlan.amountInr > 0 ? "Pay & submit application" : "Submit application"}
          </>
        )}
      </button>

      <p className="text-[11px] text-[#667781] text-center leading-relaxed">
        Payment via Razorpay (debit/credit card). After payment, Videh admin approves: documents → channel
        → templates → API keys.
      </p>
    </form>
  );
}
