import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Key,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import { devFetch } from "../lib/devFetch";
import { DeveloperApiCredentials } from "./DeveloperApiCredentials";
import { isLeadConsoleReady } from "../lib/developerPortalState";

export const DEV_LEAD_ID_KEY = "videh_dev_lead_id";
export const DEV_REF_KEY = "videh_dev_reference";

type Tab = "account" | "templates" | "usage";

type PortalTemplate = {
  id: number;
  name: string;
  display_name: string;
  category: string;
  language: string;
  body_preview: string;
  variables: string[];
  status: string;
  approved?: boolean;
  rejection_reason?: string | null;
};

type PortalAccount = {
  api_key_id: string;
  billing_status: string;
  plan_id?: string;
  amount_inr_monthly?: number;
  messages_sent_total?: number;
  messages_sent_month?: number;
  total_billed_inr?: number;
  usage_billing_month_inr?: number;
  conv_user_initiated_month?: number;
  conv_business_marketing_month?: number;
  conv_business_utility_month?: number;
  conv_free_user_used_month?: number;
  videh_phone_number_id?: string;
  videh_business_account_id?: string;
};

type PortalData = {
  lead: {
    id?: number;
    reference_code: string;
    status: string;
    wizard_step?: string;
    company_name: string;
    plan_id?: string;
    payment_status?: string;
    payment_method_verified?: boolean;
  };
  account: PortalAccount | null;
  channel?: {
    channel_phone?: string | null;
    channel_status?: string;
    phone_number_id?: string | null;
    business_account_id?: string | null;
  };
  credentials_hint?: {
    phone_number_id?: string | null;
    business_account_id?: string | null;
  };
  templates: PortalTemplate[];
  approvedCount: number;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Application in progress",
  payment_pending: "Awaiting payment verification",
  paid: "Paid — document review",
  documents_review: "Documents under review",
  channel_setup: "Phone channel setup",
  templates_review: "Templates under review",
  approved: "API access active",
  rejected: "Rejected",
};

const emptyTpl = {
  templateKey: "",
  name: "",
  category: "utility",
  language: "en",
  bodyText: "",
  variables: "",
};

export function DeveloperDashboard() {
  const [tab, setTab] = useState<Tab>("account");
  const [leadId, setLeadId] = useState(() => localStorage.getItem(DEV_LEAD_ID_KEY) ?? "");
  const [reference, setReference] = useState(() => localStorage.getItem(DEV_REF_KEY) ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [newTpl, setNewTpl] = useState(emptyTpl);
  const [submittingTpl, setSubmittingTpl] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const load = useCallback(async (override?: { id?: string; ref?: string }) => {
    let id = (override?.id ?? leadId).trim();
    let ref = (override?.ref ?? reference).trim();

    setBusy(true);
    setError("");
    try {
      const meRes = await devFetch("/api/developer-auth/me");
      const me = (await meRes.json()) as {
        success?: boolean;
        user?: { email: string };
        activeLead?: { id: number; reference_code: string };
      };
      if (!meRes.ok || !me.success) {
        setSignedInEmail(null);
        setError("Sign in to open your developer console.");
        setData(null);
        return;
      }
      setSignedInEmail(me.user?.email ?? null);
      if (me.activeLead?.id) {
        id = String(me.activeLead.id);
        ref = me.activeLead.reference_code;
        setLeadId(id);
        setReference(ref);
      }
      if (!id) {
        setError("No application yet. Use Get API access to start onboarding.");
        setData(null);
        return;
      }

      const portalQs = ref ? `?reference=${encodeURIComponent(ref)}` : "";
      const tplQs = ref ? `?reference=${encodeURIComponent(ref)}` : "";
      const [portalRes, tplRes] = await Promise.all([
        devFetch(`/api/developer-leads/${id}/portal${portalQs}`),
        devFetch(`/api/developer-leads/${id}/templates${tplQs}`),
      ]);
      const portal = (await portalRes.json()) as {
        success?: boolean;
        message?: string;
        lead?: PortalData["lead"];
        account?: PortalData["account"];
        channel?: PortalData["channel"];
        credentials_hint?: PortalData["credentials_hint"];
      };
      const tpl = (await tplRes.json()) as { templates?: PortalTemplate[]; approvedCount?: number };
      if (!portalRes.ok || !portal.success) {
        setError(portal.message ?? "Application not found. Check ID and reference.");
        setData(null);
        return;
      }
      localStorage.setItem(DEV_LEAD_ID_KEY, id);
      localStorage.setItem(DEV_REF_KEY, ref);
      setData({
        lead: portal.lead!,
        account: portal.account ?? null,
        channel: portal.channel,
        credentials_hint: portal.credentials_hint,
        templates: tpl.templates ?? [],
        approvedCount: tpl.approvedCount ?? 0,
      });
    } catch {
      setError("Could not load dashboard. Try again later.");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [leadId, reference]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitTemplate = async () => {
    const id = leadId.trim();
    if (!id) return;
    const ref = reference.trim();
    if (!newTpl.templateKey.trim() || !newTpl.bodyText.trim()) {
      setError("Template key and message body are required.");
      return;
    }
    setSubmittingTpl(true);
    setError("");
    try {
      const r = await devFetch(`/api/developer-leads/${id}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: ref || undefined,
          templateKey: newTpl.templateKey,
          name: newTpl.name || newTpl.templateKey,
          category: newTpl.category,
          language: newTpl.language,
          bodyText: newTpl.bodyText,
          variables: newTpl.variables
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const d = (await r.json()) as { success?: boolean; message?: string };
      if (!r.ok || !d.success) throw new Error(d.message ?? "Submit failed");
      setNewTpl(emptyTpl);
      await load();
      setTab("templates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit template");
    } finally {
      setSubmittingTpl(false);
    }
  };

  if (
    data &&
    isLeadConsoleReady({
      status: data.lead.status,
      wizard_step: data.lead.wizard_step,
      payment_method_verified: data.lead.payment_method_verified,
      has_api_account: Boolean(data.account),
    })
  ) {
    return null;
  }

  const phoneId =
    data?.account?.videh_phone_number_id ??
    data?.credentials_hint?.phone_number_id ??
    data?.channel?.phone_number_id;
  const businessId =
    data?.account?.videh_business_account_id ??
    data?.credentials_hint?.business_account_id ??
    data?.channel?.business_account_id;

  return (
    <section id="dashboard" className="py-16 px-4 bg-[#f0f2f5] border-t border-gray-200">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-[#111b21] mb-1 flex items-center gap-2">
          <Key className="h-6 w-6 text-[#00a884]" />
          Developer console
        </h2>
        <p className="text-[#667781] text-sm mb-6">
          Manage your Videh Business API application — submit templates for approval, view API credentials, and
          track billing after go-live.
        </p>

        <div className="rounded-2xl bg-white border border-gray-200 p-4 md:p-5 mb-6 space-y-3">
          {signedInEmail ? (
            <p className="text-sm text-[#667781]">
              Signed in as <strong className="text-[#111b21]">{signedInEmail}</strong>
            </p>
          ) : (
            <p className="text-sm text-[#667781]">
              <a href="#login" className="text-[#00a884] font-semibold hover:underline">
                Sign in
              </a>{" "}
              or{" "}
              <a href="#signup" className="text-[#00a884] font-semibold hover:underline">
                create an account
              </a>{" "}
              to open your console.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="inline-flex items-center gap-2 bg-[#00a884] text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <a
              href="#apply"
              className="inline-flex items-center gap-2 border border-[#00a884] text-[#00a884] font-semibold px-5 py-2.5 rounded-xl text-sm"
            >
              <Plus className="h-4 w-4" />
              {data ? "Continue application" : "Start application"}
            </a>
          </div>
        </div>

        {error ? <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p> : null}

        {data ? (
          <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-[#111b21]">{data.lead.company_name || "Your company"}</p>
                <p className="text-sm text-[#667781]">
                  <span className="font-mono text-[#00a884]">{data.lead.reference_code}</span>
                  {" · "}
                  {STATUS_LABELS[data.lead.status] ?? data.lead.status}
                </p>
              </div>
              {data.lead.status === "draft" || (data.lead.wizard_step && data.lead.wizard_step !== "done") ? (
                <a href="#apply" className="text-sm font-semibold text-[#00a884] hover:underline">
                  Continue application →
                </a>
              ) : null}
            </div>

            <div className="flex border-b border-gray-100 overflow-x-auto">
              {(
                [
                  { id: "account" as Tab, label: "API & account", icon: Key },
                  { id: "templates" as Tab, label: "Templates", icon: MessageSquare },
                  { id: "usage" as Tab, label: "Billing & usage", icon: BarChart3 },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${
                    tab === id
                      ? "border-[#00a884] text-[#00a884]"
                      : "border-transparent text-[#667781] hover:text-[#111b21]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5 md:p-6">
              {tab === "account" && (
                <div className="space-y-4 text-sm">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#f0f2f5] p-4">
                      <p className="text-xs text-[#667781] uppercase font-semibold">Plan</p>
                      <p className="font-semibold text-[#111b21] mt-1">{data.lead.plan_id ?? "—"}</p>
                    </div>
                    <div className="rounded-xl bg-[#f0f2f5] p-4">
                      <p className="text-xs text-[#667781] uppercase font-semibold">Payment</p>
                      <p className="font-semibold text-[#111b21] mt-1">
                        {data.lead.payment_method_verified ? "Verified" : data.lead.payment_status ?? "Pending"}
                      </p>
                    </div>
                  </div>

                  {data.account ? (
                    <>
                      <DeveloperApiCredentials
                        leadId={leadId}
                        reference={reference}
                        apiKeyId={data.account.api_key_id}
                        billingStatus={data.account.billing_status}
                      />
                      {phoneId || businessId ? (
                        <div className="rounded-xl bg-[#f0f2f5] p-4 space-y-2 text-sm">
                          {phoneId ? (
                            <p>
                              Phone Number ID: <code className="text-[#00a884] text-xs">{phoneId}</code>
                            </p>
                          ) : null}
                          {businessId ? (
                            <p>
                              Business Account ID: <code className="text-[#00a884] text-xs">{businessId}</code>
                            </p>
                          ) : null}
                          <p className="text-xs text-[#667781] pt-1">
                            Base URL: <code>/v1</code> · <code>GET /v1/me</code> ·{" "}
                            <code>POST /v1/&#123;phone-number-id&#125;/messages</code>
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : phoneId ? (
                    <div className="rounded-xl bg-[#f0f2f5] p-4">
                      <p className="font-semibold text-[#111b21] mb-2">Channel IDs (API keys after full approval)</p>
                      <p>
                        Phone Number ID: <code>{phoneId}</code>
                      </p>
                      {businessId ? (
                        <p className="mt-1">
                          Business Account ID: <code>{businessId}</code>
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[#667781]">
                      Complete onboarding and pass Videh review to receive API keys. Submit templates while your
                      application is in review.
                    </p>
                  )}
                </div>
              )}

              {tab === "templates" && (
                <div className="space-y-6">
                  <p className="text-sm text-[#667781]">
                    You create templates here. Videh admin only <strong>approves or rejects</strong> them (typically
                    24–72 hours). Use approved <code className="text-xs">template_key</code> names in{" "}
                    <code className="text-xs">POST /v1/&#123;phone-number-id&#125;/messages</code>.
                  </p>

                  <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-[#fafafa]">
                    <p className="font-semibold text-[#111b21] flex items-center gap-2">
                      <Send className="h-4 w-4 text-[#00a884]" />
                      Submit new template
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input
                        placeholder="template_key e.g. order_update"
                        value={newTpl.templateKey}
                        onChange={(e) => setNewTpl((s) => ({ ...s, templateKey: e.target.value }))}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono"
                      />
                      <input
                        placeholder="Display name"
                        value={newTpl.name}
                        onChange={(e) => setNewTpl((s) => ({ ...s, name: e.target.value }))}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      />
                      <select
                        value={newTpl.category}
                        onChange={(e) => setNewTpl((s) => ({ ...s, category: e.target.value }))}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      >
                        <option value="utility">utility</option>
                        <option value="marketing">marketing</option>
                        <option value="authentication">authentication</option>
                        <option value="service">service</option>
                      </select>
                      <input
                        placeholder="Language e.g. en"
                        value={newTpl.language}
                        onChange={(e) => setNewTpl((s) => ({ ...s, language: e.target.value }))}
                        className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <textarea
                      placeholder="Body text with {{1}} {{2}} placeholders"
                      value={newTpl.bodyText}
                      onChange={(e) => setNewTpl((s) => ({ ...s, bodyText: e.target.value }))}
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm resize-none"
                    />
                    <input
                      placeholder="Variables: customer_name, order_id"
                      value={newTpl.variables}
                      onChange={(e) => setNewTpl((s) => ({ ...s, variables: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={submittingTpl}
                      onClick={() => void submitTemplate()}
                      className="bg-[#00a884] text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60 text-sm"
                    >
                      {submittingTpl ? "Submitting…" : "Submit for approval"}
                    </button>
                  </div>

                  <div>
                    <p className="font-semibold text-[#111b21] mb-3">
                      Your templates ({data.approvedCount} approved)
                    </p>
                    {data.templates.length === 0 ? (
                      <p className="text-sm text-[#667781]">No templates yet. Submit your first template above.</p>
                    ) : (
                      <ul className="space-y-3">
                        {data.templates.map((t) => (
                          <li key={t.id} className="rounded-xl border border-gray-100 p-4 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-mono font-semibold text-[#00a884]">{t.name}</p>
                                <p className="text-[#111b21]">{t.display_name}</p>
                                <p className="text-xs text-[#667781] mt-1">
                                  {t.category} · {t.language}
                                </p>
                              </div>
                              {t.status === "approved" || t.approved ? (
                                <span className="inline-flex items-center gap-1 text-xs text-[#00a884] font-semibold">
                                  <CheckCircle2 className="h-4 w-4" /> Approved
                                </span>
                              ) : (
                                <span
                                  className={`text-xs px-2 py-0.5 rounded font-medium ${
                                    t.status === "rejected"
                                      ? "bg-red-50 text-red-700"
                                      : "bg-amber-50 text-amber-800"
                                  }`}
                                >
                                  {t.status}
                                </span>
                              )}
                            </div>
                            <p className="text-[#667781] mt-2 text-xs">{t.body_preview}</p>
                            {t.rejection_reason ? (
                              <p className="text-xs text-red-600 mt-1">Reason: {t.rejection_reason}</p>
                            ) : null}
                            {t.status === "rejected" ? (
                              <p className="text-xs text-[#667781] mt-1">Edit and resubmit with the same template_key.</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {tab === "usage" && (
                <div className="space-y-4 text-sm">
                  {data.account ? (
                    <>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="rounded-xl bg-[#f0f2f5] p-4">
                          <p className="text-xs text-[#667781]">Messages (month)</p>
                          <p className="text-xl font-bold text-[#111b21]">{data.account.messages_sent_month ?? 0}</p>
                        </div>
                        <div className="rounded-xl bg-[#f0f2f5] p-4">
                          <p className="text-xs text-[#667781]">Messages (total)</p>
                          <p className="text-xl font-bold text-[#111b21]">{data.account.messages_sent_total ?? 0}</p>
                        </div>
                        <div className="rounded-xl bg-[#f0f2f5] p-4">
                          <p className="text-xs text-[#667781]">Usage billed (month)</p>
                          <p className="text-xl font-bold text-[#111b21]">₹{data.account.usage_billing_month_inr ?? 0}</p>
                        </div>
                        <div className="rounded-xl bg-[#f0f2f5] p-4">
                          <p className="text-xs text-[#667781]">Total billed</p>
                          <p className="text-xl font-bold text-[#111b21]">₹{data.account.total_billed_inr ?? 0}</p>
                        </div>
                        <div className="rounded-xl bg-[#f0f2f5] p-4">
                          <p className="text-xs text-[#667781]">Platform plan / mo</p>
                          <p className="text-xl font-bold text-[#111b21]">
                            {data.account.amount_inr_monthly
                              ? `₹${data.account.amount_inr_monthly}`
                              : data.account.plan_id ?? "—"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-[#f0f2f5] p-4">
                          <p className="text-xs text-[#667781]">Billing status</p>
                          <p className="text-lg font-bold text-[#111b21]">{data.account.billing_status}</p>
                        </div>
                      </div>
                      <p className="text-xs text-[#667781]">
                        Conversations this month — user-initiated: {data.account.conv_user_initiated_month ?? 0},
                        marketing: {data.account.conv_business_marketing_month ?? 0}, utility:{" "}
                        {data.account.conv_business_utility_month ?? 0}, free tier used:{" "}
                        {data.account.conv_free_user_used_month ?? 0}
                      </p>
                    </>
                  ) : (
                    <p className="text-[#667781]">
                      Billing and usage metrics appear after your application is approved and the API account is
                      created.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
