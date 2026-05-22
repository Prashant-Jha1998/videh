import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  CreditCard,
  FileText,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  Phone,
  Upload,
} from "lucide-react";
import { ConversationPricing } from "./ConversationPricing";
import { OnboardingConsoleLayout } from "./OnboardingConsoleLayout";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const STEPS = ["plan", "company", "documents", "profile", "channel", "payment", "done"] as const;
type Step = (typeof STEPS)[number];

const MODULES: {
  id: Step;
  label: string;
  subtitle: string;
  icon: typeof Building2;
  section: "setup" | "review";
}[] = [
  { id: "plan", label: "Plan & billing", subtitle: "Partner tier & usage model", icon: CreditCard, section: "setup" },
  { id: "company", label: "Business information", subtitle: "Legal entity & signatory", icon: Building2, section: "setup" },
  { id: "documents", label: "Compliance documents", subtitle: "GST, COI, KYC by entity", icon: FileText, section: "setup" },
  { id: "profile", label: "Business profile", subtitle: "Display name & logo", icon: ImagePlus, section: "setup" },
  { id: "channel", label: "Phone & channel", subtitle: "Dedicated number + OTP", icon: Phone, section: "setup" },
  { id: "payment", label: "Payment verification", subtitle: "Card / UPI method check", icon: CreditCard, section: "setup" },
  { id: "done", label: "Application status", subtitle: "Review pipeline & next steps", icon: LayoutDashboard, section: "review" },
];

const REVIEW_PIPELINE = [
  { key: "documents_review", label: "Document verification", desc: "GST, registration & director ID" },
  { key: "channel_setup", label: "Business channel", desc: "Phone number & business account" },
  { key: "templates_review", label: "Message templates", desc: "Utility / marketing template approval" },
  { key: "approved", label: "API access", desc: "Production keys & webhooks" },
] as const;

const ENTITY_TYPES = [
  { value: "pvt_ltd", label: "Private Limited (Pvt Ltd)" },
  { value: "llp", label: "LLP" },
  { value: "proprietorship", label: "Proprietorship / Individual" },
  { value: "partnership", label: "Partnership" },
  { value: "other", label: "Other registered entity" },
];

type Plan = { id: string; name: string; amountInr: number };
type DocReq = { key: string; label: string; required: boolean };

const STORAGE_KEY = "videh_dev_lead_id";

/** Uploaded files are served from api-server at /uploads (proxied on developer.videh.co.in). */
function resolveUploadUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

type Props = { onClose: () => void };

export function OnboardingWizard({ onClose }: Props) {
  const [step, setStep] = useState<Step>("plan");
  const [leadId, setLeadId] = useState<number | null>(null);
  const [reference, setReference] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planId, setPlanId] = useState("starter");
  const [docs, setDocs] = useState<DocReq[]>([]);
  const [uploaded, setUploaded] = useState<Set<string>>(new Set());
  const [logoUrl, setLogoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [maxReachedIndex, setMaxReachedIndex] = useState(0);
  const [leadStatus, setLeadStatus] = useState<string>("draft");
  const [channelPhone, setChannelPhone] = useState("");
  const [channelOtp, setChannelOtp] = useState("");
  const [channelVerified, setChannelVerified] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [channelOtpSent, setChannelOtpSent] = useState(false);

  const [company, setCompany] = useState({
    companyName: "",
    entityType: "pvt_ltd",
    contactName: "",
    email: "",
    phone: "",
    website: "",
    gstin: "",
    cin: "",
    llpin: "",
    udyam: "",
    monthlyVolume: "under_10k",
    useCase: "",
    message: "",
  });

  const [profile, setProfile] = useState({
    displayName: "",
    businessCategory: "",
    businessDescription: "",
    businessAddress: "",
  });

  const selectedPlan = plans.find((p) => p.id === planId) ?? { id: "starter", name: "Starter", amountInr: 2999 };

  const loadDocs = useCallback(async (entity: string) => {
    const r = await fetch(`/api/developer-leads/document-types?entity=${entity}`);
    const d = (await r.json()) as { documents?: DocReq[] };
    setDocs(d.documents ?? []);
  }, []);

  const loadLead = useCallback(
    async (id: number) => {
      const r = await fetch(`/api/developer-leads/${id}`);
      const d = (await r.json()) as {
        lead?: Record<string, unknown>;
        documents?: { doc_type: string }[];
      };
      if (!d.lead) return;
      const L = d.lead;
      setReference(String(L.reference_code ?? ""));
      setPlanId(String(L.plan_id ?? "starter"));
      const ws = String(L.wizard_step ?? "plan");
      if (STEPS.includes(ws as Step)) {
        setStep(ws as Step);
        setMaxReachedIndex(Math.max(STEPS.indexOf(ws as Step), STEPS.indexOf("plan")));
      }
      setLeadStatus(String(L.status ?? "draft"));
      const chPhone = String(L.channel_phone ?? "");
      setChannelPhone(chPhone.startsWith("91") ? chPhone.slice(2) : chPhone);
      setChannelVerified(L.channel_status === "verified");
      setPhoneNumberId(String(L.videh_phone_number_id ?? ""));
      setBusinessAccountId(String(L.videh_business_account_id ?? ""));
      setLogoUrl(resolveUploadUrl(String(L.logo_url ?? "")));
      setChannelOtpSent(L.channel_status === "otp_pending");
      setCompany({
        companyName: String(L.company_name ?? ""),
        entityType: String(L.entity_type ?? "pvt_ltd"),
        contactName: String(L.contact_name ?? ""),
        email: String(L.email ?? ""),
        phone: String(L.phone ?? ""),
        website: String(L.website ?? ""),
        gstin: String(L.gstin ?? ""),
        cin: String(L.cin ?? ""),
        llpin: String(L.llpin ?? ""),
        udyam: String(L.udyam ?? ""),
        monthlyVolume: String(L.monthly_volume ?? "under_10k"),
        useCase: String(L.use_case ?? ""),
        message: String(L.message ?? ""),
      });
      setProfile({
        displayName: String(L.display_name ?? ""),
        businessCategory: String(L.business_category ?? ""),
        businessDescription: String(L.business_description ?? ""),
        businessAddress: String(L.business_address ?? ""),
      });
      setUploaded(new Set((d.documents ?? []).map((x) => x.doc_type)));
      await loadDocs(String(L.entity_type ?? "pvt_ltd"));
    },
    [loadDocs],
  );

  useEffect(() => {
    fetch("/api/developer-leads")
      .then((r) => r.json())
      .then((d: { plans?: Plan[] }) => {
        if (d.plans?.length) setPlans(d.plans);
      })
      .catch(() => {});
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const id = Number(saved);
      if (id) {
        setLeadId(id);
        void loadLead(id);
      }
    }
    void loadDocs("pvt_ltd");
  }, [loadDocs, loadLead]);

  async function patchLead(body: Record<string, unknown>, idOverride?: number) {
    const id = idOverride ?? leadId;
    if (!id) throw new Error("Application not started");
    const r = await fetch(`/api/developer-leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await r.json()) as { success?: boolean; message?: string };
    if (!r.ok || !d.success) throw new Error(d.message ?? "Save failed");
  }

  async function startDraft() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/developer-leads/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const d = (await r.json()) as {
        success?: boolean;
        leadId?: number;
        reference?: string;
        message?: string;
        detail?: string;
      };
      if (!r.ok || !d.success || !d.leadId) {
        throw new Error(d.message ?? d.detail ?? "Could not start application");
      }
      setLeadId(d.leadId);
      setReference(d.reference ?? "");
      localStorage.setItem(STORAGE_KEY, String(d.leadId));
      await patchLead({ wizardStep: "company", planId }, d.leadId);
      setStep("company");
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY);
      setLeadId(null);
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveCompany() {
    setBusy(true);
    setError("");
    try {
      if (!leadId) throw new Error("Start from plan step first");
      await patchLead({
        companyName: company.companyName,
        entityType: company.entityType,
        contactName: company.contactName,
        email: company.email,
        phone: company.phone,
        website: company.website,
        gstin: company.gstin,
        cin: company.cin,
        llpin: company.llpin,
        udyam: company.udyam,
        monthlyVolume: company.monthlyVolume,
        useCase: company.useCase,
        message: company.message,
        wizardStep: "documents",
      });
      await loadDocs(company.entityType);
      setStep("documents");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDoc(docType: string, file: File) {
    if (!leadId) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("docType", docType);
      fd.append("file", file);
      const r = await fetch(`/api/developer-leads/${leadId}/documents`, { method: "POST", body: fd });
      const d = (await r.json()) as { success?: boolean; message?: string };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Upload failed");
      setUploaded((prev) => new Set(prev).add(docType));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setError("");
    try {
      await patchLead({
        displayName: profile.displayName,
        businessCategory: profile.businessCategory,
        businessDescription: profile.businessDescription,
        businessAddress: profile.businessAddress,
        wizardStep: "channel",
      });
      setStep("channel");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!leadId) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const r = await fetch(`/api/developer-leads/${leadId}/logo`, { method: "POST", body: fd });
      const d = (await r.json()) as { success?: boolean; logoUrl?: string; message?: string };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Logo upload failed");
      setLogoUrl(resolveUploadUrl(d.logoUrl ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Logo failed");
    } finally {
      setBusy(false);
    }
  }

  async function openRazorpay(checkout: { orderId: string; amountInr: number; keyId: string; currency: string }) {
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
        description: `Videh — payment method verification (₹5)`,
        order_id: checkout.orderId,
        prefill: { name: company.contactName, email: company.email, contact: company.phone },
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
                leadId,
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

  async function startPayment() {
    if (!leadId) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/developer-leads/${leadId}/start-payment`, { method: "POST" });
      const d = (await r.json()) as {
        success?: boolean;
        needsPayment?: boolean;
        checkout?: { orderId: string; amountInr: number; keyId: string; currency: string };
        message?: string;
      };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Payment start failed");
      if (d.needsPayment && d.checkout) {
        await openRazorpay(d.checkout);
      }
      localStorage.removeItem(STORAGE_KEY);
      setLeadStatus("paid");
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendChannelOtpRequest() {
    if (!leadId || !channelPhone.trim()) return;
    setBusy(true);
    setError("");
    setDevOtpHint(null);
    try {
      const r = await fetch(`/api/developer-leads/${leadId}/channel/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelPhone: channelPhone.trim() }),
      });
      const d = (await r.json()) as { success?: boolean; message?: string; devOtp?: string };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Could not send OTP");
      setChannelOtpSent(true);
      if (d.devOtp) setDevOtpHint(d.devOtp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "OTP failed");
    } finally {
      setBusy(false);
    }
  }

  async function verifyChannelOtpRequest() {
    if (!leadId) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/developer-leads/${leadId}/channel/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelPhone: channelPhone.trim(), otp: channelOtp.trim() }),
      });
      const d = (await r.json()) as {
        success?: boolean;
        message?: string;
        channel?: { phone_number_id?: string; business_account_id?: string };
      };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Verification failed");
      setChannelVerified(true);
      setPhoneNumberId(d.channel?.phone_number_id ?? "");
      setBusinessAccountId(d.channel?.business_account_id ?? "");
      setStep("payment");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = STEPS.indexOf(step);
  const requiredMissing = docs.filter((d) => d.required && !uploaded.has(d.key));
  const currentModule = MODULES.find((m) => m.id === step) ?? MODULES[0]!;

  useEffect(() => {
    if (stepIndex > maxReachedIndex) setMaxReachedIndex(stepIndex);
  }, [stepIndex, maxReachedIndex]);

  function canGoTo(target: Step): boolean {
    if (target === "done") return step === "done" || maxReachedIndex >= STEPS.indexOf("payment");
    return STEPS.indexOf(target) <= maxReachedIndex;
  }

  function goToModule(target: Step) {
    if (!canGoTo(target)) return;
    setStep(target);
    setError("");
  }

  function moduleStatus(mod: (typeof MODULES)[number]): "current" | "done" | "available" | "locked" {
    const idx = STEPS.indexOf(mod.id);
    if (step === mod.id) return "current";
    if (!canGoTo(mod.id)) return "locked";
    if (idx < stepIndex) return "done";
    return "available";
  }

  const statusOrder = ["draft", "payment_pending", "paid", "documents_review", "channel_setup", "templates_review", "approved"];
  const statusIdx = statusOrder.indexOf(leadStatus);

  return (
    <OnboardingConsoleLayout
      reference={reference}
      currentModule={currentModule}
      modules={MODULES}
      step={step}
      canGoTo={(id) => canGoTo(id as Step)}
      moduleStatus={(mod) => moduleStatus(mod as (typeof MODULES)[number])}
      onGoTo={(id) => goToModule(id as Step)}
      onClose={onClose}
      progressSteps={[...STEPS.slice(0, -1)]}
      stepIndex={stepIndex}
    >
      {error ? (
        <p className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>
      ) : null}

          {step === "plan" && (
            <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-6">
              <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">Module 1 of 6</p>
              <h2 className="text-2xl font-bold text-[#111b21]">Choose your plan</h2>
              <p className="text-sm text-[#667781]">
                Monthly subscription is billed in your company name. If payment fails later, API access is
                automatically held until payment is captured again.
              </p>
              <div className="space-y-3">
                {(plans.length ? plans : [
                  { id: "starter", name: "Starter", amountInr: 2999 },
                  { id: "growth", name: "Growth", amountInr: 9999 },
                  { id: "enterprise", name: "Enterprise", amountInr: 0 },
                ]).map((p) => (
                  <label
                    key={p.id}
                    className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                      planId === p.id ? "border-[#00a884] bg-[#00a884]/5" : "border-gray-200"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="plan"
                        checked={planId === p.id}
                        onChange={() => setPlanId(p.id)}
                        className="accent-[#00a884]"
                      />
                      <span className="font-semibold text-[#111b21]">{p.name}</span>
                    </span>
                    <span className="text-sm font-medium text-[#667781]">
                      {p.amountInr > 0 ? `₹${p.amountInr.toLocaleString("en-IN")}/mo` : "Custom"}
                    </span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (leadId) {
                    void (async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await patchLead({ wizardStep: "company", planId }, leadId);
                        setStep("company");
                      } catch (e) {
                        localStorage.removeItem(STORAGE_KEY);
                        setLeadId(null);
                        setError(e instanceof Error ? e.message : "Could not resume application");
                      } finally {
                        setBusy(false);
                      }
                    })();
                  } else {
                    void startDraft();
                  }
                }}
                className="w-full flex items-center justify-center gap-2 bg-[#00a884] hover:bg-[#008f6f] text-white font-semibold py-3 rounded-xl disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </button>
            </section>
          )}

          {step === "company" && (
            <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-4">
              <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">Module 2 of 6</p>
              <h2 className="text-2xl font-bold text-[#111b21] flex items-center gap-2">
                <Building2 className="h-6 w-6 text-[#00a884]" /> Company details
              </h2>
              <p className="text-sm text-[#667781]">
                Documents in the next step depend on entity type — Pvt Ltd, LLP, or Proprietorship (GST + Udyam).
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <label className="md:col-span-2 block space-y-1">
                  <span className="text-sm font-medium">Legal company name *</span>
                  <input
                    required
                    value={company.companyName}
                    onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Entity type *</span>
                  <select
                    value={company.entityType}
                    onChange={(e) => {
                      setCompany({ ...company, entityType: e.target.value });
                      void loadDocs(e.target.value);
                    }}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">GSTIN</span>
                  <input
                    value={company.gstin}
                    onChange={(e) => setCompany({ ...company, gstin: e.target.value.toUpperCase() })}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  />
                </label>
                {company.entityType === "pvt_ltd" && (
                  <label className="block space-y-1 md:col-span-2">
                    <span className="text-sm font-medium">CIN</span>
                    <input
                      value={company.cin}
                      onChange={(e) => setCompany({ ...company, cin: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                    />
                  </label>
                )}
                {company.entityType === "llp" && (
                  <label className="block space-y-1 md:col-span-2">
                    <span className="text-sm font-medium">LLPIN</span>
                    <input
                      value={company.llpin}
                      onChange={(e) => setCompany({ ...company, llpin: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                    />
                  </label>
                )}
                {company.entityType === "proprietorship" && (
                  <label className="block space-y-1 md:col-span-2">
                    <span className="text-sm font-medium">Udyam registration *</span>
                    <input
                      value={company.udyam}
                      onChange={(e) => setCompany({ ...company, udyam: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                    />
                  </label>
                )}
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Contact person *</span>
                  <input
                    required
                    value={company.contactName}
                    onChange={(e) => setCompany({ ...company, contactName: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Work email *</span>
                  <input
                    required
                    type="email"
                    value={company.email}
                    onChange={(e) => setCompany({ ...company, email: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Phone *</span>
                  <input
                    required
                    value={company.phone}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Website</span>
                  <input
                    value={company.website}
                    onChange={(e) => setCompany({ ...company, website: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                  />
                </label>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep("plan")} className="px-4 py-2 rounded-xl border text-sm">
                  <ArrowLeft className="h-4 w-4 inline mr-1" /> Back
                </button>
                <button
                  type="button"
                  disabled={busy || !company.companyName || !company.contactName || !company.email || !company.phone}
                  onClick={() => void saveCompany()}
                  className="flex-1 bg-[#00a884] text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save & upload documents"}
                </button>
              </div>
            </section>
          )}

          {step === "documents" && (
            <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-4">
              <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">Module 3 of 6</p>
              <h2 className="text-2xl font-bold text-[#111b21]">Upload documents</h2>
              <p className="text-sm text-[#667781]">
                Required documents for{" "}
                <strong>{ENTITY_TYPES.find((e) => e.value === company.entityType)?.label}</strong>. Admin will
                verify each file before API release.
              </p>
              <ul className="space-y-3">
                {docs.map((d) => (
                  <li
                    key={d.key}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-gray-200"
                  >
                    <div>
                      <p className="font-medium text-sm text-[#111b21]">
                        {d.label} {d.required ? "*" : "(optional)"}
                      </p>
                      {uploaded.has(d.key) ? (
                        <p className="text-xs text-[#00a884] flex items-center gap-1 mt-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
                        </p>
                      ) : null}
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#00a884] cursor-pointer">
                      <Upload className="h-4 w-4" />
                      {uploaded.has(d.key) ? "Replace" : "Upload"}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadDoc(d.key, f);
                        }}
                      />
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep("company")} className="px-4 py-2 rounded-xl border text-sm">
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy || requiredMissing.length > 0}
                  onClick={() => setStep("profile")}
                  className="flex-1 bg-[#00a884] text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
                >
                  {requiredMissing.length > 0
                    ? `Upload ${requiredMissing.length} required file(s)`
                    : "Business profile"}
                </button>
              </div>
            </section>
          )}

          {step === "profile" && (
            <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-4">
              <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">Module 4 of 6</p>
              <h2 className="text-2xl font-bold text-[#111b21]">Business profile</h2>
              <p className="text-sm text-[#667781]">
                Set how your company appears on Videh — display name and logo (verified business profile).
              </p>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Company logo *</span>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <img src={resolveUploadUrl(logoUrl)} alt="Logo" className="h-16 w-16 rounded-xl object-cover border" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400">
                      <ImagePlus className="h-8 w-8" />
                    </div>
                  )}
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#00a884] text-[#00a884] text-sm font-semibold cursor-pointer">
                    Upload logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadLogo(f);
                      }}
                    />
                  </label>
                </div>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Display name *</span>
                <input
                  value={profile.displayName}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  placeholder="Brand name customers see"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Business category</span>
                <input
                  value={profile.businessCategory}
                  onChange={(e) => setProfile({ ...profile, businessCategory: e.target.value })}
                  placeholder="e.g. E-commerce, Finance"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Description</span>
                <textarea
                  rows={2}
                  value={profile.businessDescription}
                  onChange={(e) => setProfile({ ...profile, businessDescription: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm resize-none"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Registered address</span>
                <textarea
                  rows={2}
                  value={profile.businessAddress}
                  onChange={(e) => setProfile({ ...profile, businessAddress: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm resize-none"
                />
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep("documents")} className="px-4 py-2 rounded-xl border text-sm">
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy || !profile.displayName.trim() || !logoUrl}
                  onClick={() => void saveProfile()}
                  className="flex-1 bg-[#00a884] text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
                >
                  Continue to phone verification
                </button>
              </div>
            </section>
          )}

          {step === "channel" && (
            <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-6">
              <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">Module 5 of 6</p>
              <h2 className="text-2xl font-bold text-[#111b21] flex items-center gap-2">
                <Phone className="h-6 w-6 text-[#00a884]" /> Phone number verification
              </h2>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
                <p className="font-semibold">Dedicated business number (required)</p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>Must not be registered on any personal messaging app already</li>
                  <li>New SIM or landline — OTP verification on that number</li>
                  <li>Number is hard to migrate later — choose carefully</li>
                </ul>
              </div>
              {!channelVerified ? (
                <>
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">Channel phone (10 digits) *</span>
                    <input
                      value={channelPhone}
                      onChange={(e) => {
                        setChannelPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                        setChannelOtpSent(false);
                        setDevOtpHint(null);
                      }}
                      placeholder="9876543210"
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-mono"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || channelPhone.length !== 10 || channelOtpSent}
                    onClick={() => void sendChannelOtpRequest()}
                    className="w-full border border-[#00a884] text-[#00a884] font-semibold py-2.5 rounded-xl disabled:opacity-50"
                  >
                    {busy ? "Sending…" : channelOtpSent ? "OTP sent — check your phone" : "Send OTP to this number"}
                  </button>
                  {devOtpHint ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Dev mode OTP: <strong className="font-mono">{devOtpHint}</strong>
                    </p>
                  ) : null}
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">Enter OTP *</span>
                    <input
                      value={channelOtp}
                      onChange={(e) => setChannelOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit code"
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-mono tracking-widest"
                    />
                  </label>
                </>
              ) : (
                <div className="rounded-xl bg-[#f0f2f5] p-4 space-y-3 text-sm">
                  <p className="font-semibold text-[#111b21] flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-[#00a884]" /> Channel verified
                  </p>
                  <p>
                    <span className="text-[#667781]">Phone Number ID:</span>{" "}
                    <code className="text-[#00a884]">{phoneNumberId}</code>
                  </p>
                  <p>
                    <span className="text-[#667781]">Business Account ID:</span>{" "}
                    <code className="text-[#00a884]">{businessAccountId}</code>
                  </p>
                  <p className="text-xs text-[#667781]">
                    API: POST /v1/{phoneNumberId}/messages
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep("profile")} className="px-4 py-2 rounded-xl border text-sm">
                  Back
                </button>
                {!channelVerified ? (
                  <button
                    type="button"
                    disabled={busy || channelOtp.length !== 6}
                    onClick={() => void verifyChannelOtpRequest()}
                    className="flex-1 bg-[#00a884] text-white font-semibold py-2.5 rounded-xl disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Verify OTP & continue"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStep("payment")}
                    className="flex-1 bg-[#00a884] text-white font-semibold py-2.5 rounded-xl"
                  >
                    Continue to payment
                  </button>
                )}
              </div>
            </section>
          )}

          {step === "payment" && (
            <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-6">
              <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">Module 6 of 6</p>
              <h2 className="text-2xl font-bold text-[#111b21] flex items-center gap-2">
                <CreditCard className="h-6 w-6 text-[#00a884]" /> Payment method verification
              </h2>
              <ConversationPricing variant="light" />
              <div className="rounded-xl border-2 border-[#00a884]/40 bg-[#00a884]/5 p-4">
                <p className="text-sm text-[#111b21] font-semibold mb-1">Required before API keys</p>
                <p className="text-sm text-[#667781]">
                  Verify debit/credit card or UPI. Usage bills per conversation to your company; failed monthly
                  payment → API on hold.
                </p>
                {selectedPlan.amountInr > 0 ? (
                  <p className="text-lg font-bold text-[#111b21] mt-4">
                    Verify now: ₹5 <span className="text-sm font-normal text-[#667781]">(method check)</span>
                  </p>
                ) : (
                  <p className="text-sm text-[#667781] mt-4">Enterprise — admin sets up billing manually.</p>
                )}
                <p className="text-xs text-[#667781] mt-2">
                  Platform {selectedPlan.name}: ₹
                  {selectedPlan.amountInr > 0 ? `${selectedPlan.amountInr.toLocaleString("en-IN")}/mo` : "custom"} —
                  partner fee after go-live.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep("channel")} className="px-4 py-2 rounded-xl border text-sm">
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy || !channelVerified}
                  onClick={() => void startPayment()}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#00a884] text-white font-semibold py-3 rounded-xl disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Verify payment method & submit</>}
                </button>
              </div>
            </section>
          )}

          {step === "done" && (
            <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-6">
              <div className="text-center pb-4 border-b border-gray-100">
                <CheckCircle2 className="h-12 w-12 text-[#00a884] mx-auto mb-3" />
                <h2 className="text-2xl font-bold text-[#111b21]">Application submitted</h2>
                {reference ? <p className="font-mono text-[#00a884] mt-2 text-sm">{reference}</p> : null}
                <p className="text-[#667781] text-sm max-w-lg mx-auto mt-3">
                  Your setup modules are complete. Videh will now run verification — similar to enterprise messaging
                  API onboarding. Track progress below.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#111b21] uppercase tracking-wide mb-4">Review pipeline</h3>
                <ol className="space-y-0">
                  {REVIEW_PIPELINE.map((phase, i) => {
                    const phaseIdx = statusOrder.indexOf(phase.key);
                    const done = statusIdx >= 0 && statusIdx >= phaseIdx;
                    const active = leadStatus === phase.key || (statusIdx + 1 === phaseIdx && !done);
                    return (
                      <li key={phase.key} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
                              done
                                ? "bg-[#00a884] border-[#00a884] text-white"
                                : active
                                  ? "border-[#00a884] text-[#00a884] bg-[#00a884]/10"
                                  : "border-gray-200 text-gray-400"
                            }`}
                          >
                            {done ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-xs font-bold">{i + 1}</span>}
                          </span>
                          {i < REVIEW_PIPELINE.length - 1 ? (
                            <span className={`w-0.5 flex-1 min-h-[32px] my-1 ${done ? "bg-[#00a884]" : "bg-gray-200"}`} />
                          ) : null}
                        </div>
                        <div className="pb-8">
                          <p className={`font-semibold text-sm ${active ? "text-[#00a884]" : "text-[#111b21]"}`}>{phase.label}</p>
                          <p className="text-xs text-[#667781] mt-0.5">{phase.desc}</p>
                          {active ? (
                            <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                              In progress
                            </span>
                          ) : done ? (
                            <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wide text-[#00a884] bg-[#00a884]/10 px-2 py-0.5 rounded">
                              Complete
                            </span>
                          ) : (
                            <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wide text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                              Pending
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
              <div className="rounded-xl bg-[#f0f2f5] p-4 text-sm text-[#667781]">
                <p className="font-semibold text-[#111b21] mb-1">What happens next?</p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  <li>Save your reference code — you will need it to track templates in the developer portal.</li>
                  <li>After API approval, use GET /v1/templates to list approved template names for your website.</li>
                  <li>Questions: developer@videh.co.in</li>
                </ul>
              </div>
              <button type="button" onClick={onClose} className="w-full text-center text-[#00a884] font-semibold hover:underline py-2">
                Exit to developer home
              </button>
            </section>
          )}
    </OnboardingConsoleLayout>
  );
}
