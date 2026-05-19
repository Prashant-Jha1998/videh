import { useState, type FormEvent } from "react";
import { Building2, Loader2, Send } from "lucide-react";

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
};

export function LeadForm() {
  const [form, setForm] = useState<FormState>(initial);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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
      const data = (await res.json()) as { success?: boolean; message?: string; reference?: string };
      if (!res.ok || !data.success) {
        throw new Error(data.message ?? "Submission failed");
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
        <h3 className="text-xl font-bold text-[#111b21] mb-2">Application received</h3>
        <p className="text-[#667781] max-w-md mx-auto">
          Our onboarding team will verify your company documents and contact you within 1–2 business days
          with sandbox access and next steps for Meta Business verification.
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
          <p className="text-sm text-[#667781]">Real businesses only — GST & company docs required</p>
        </div>
      </div>

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
            Submitting…
          </>
        ) : (
          <>
            <Send className="h-5 w-5" />
            Request API access
          </>
        )}
      </button>

      <p className="text-[11px] text-[#667781] text-center leading-relaxed">
        By applying you confirm your business is genuine and agree to Meta&apos;s business messaging policies.
        Videh rejects fake entities, spam, and policy-violating use cases.
      </p>
    </form>
  );
}
