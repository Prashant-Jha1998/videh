import { useState } from "react";
import { BarChart3, CheckCircle2, Key, Loader2, Phone, RefreshCw, Send } from "lucide-react";
import { devFetch } from "../lib/devFetch";
import type { PortalData } from "../hooks/useDeveloperPortal";
import { PORTAL_STATUS_LABELS } from "../hooks/useDeveloperPortal";

const emptyTpl = {
  templateKey: "",
  name: "",
  category: "utility",
  language: "en",
  bodyText: "",
  variables: "",
};

function phoneId(data: PortalData | null) {
  return (
    data?.account?.videh_phone_number_id ??
    data?.credentials_hint?.phone_number_id ??
    data?.channel?.phone_number_id
  );
}

function businessId(data: PortalData | null) {
  return (
    data?.account?.videh_business_account_id ??
    data?.credentials_hint?.business_account_id ??
    data?.channel?.business_account_id
  );
}

type PanelProps = {
  data: PortalData | null;
  busy: boolean;
  error: string;
  leadId: string;
  reference: string;
  onRefresh: () => void;
  onError: (msg: string) => void;
  onReload: () => Promise<void>;
};

export function DeveloperChannelPanel({ data, busy, error, onRefresh }: PanelProps) {
  const phone = phoneId(data);
  const business = businessId(data);
  const channelPhone = data?.channel?.channel_phone;
  const channelStatus = data?.channel?.channel_status ?? "pending";

  return (
    <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-5">
      <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">Business channel</p>
      <h2 className="text-2xl font-bold text-[#111b21]">Phone &amp; channel IDs</h2>
      <p className="text-sm text-[#667781]">
        Your verified business number and Videh channel identifiers. Production API keys appear under{" "}
        <strong>API access</strong> after full approval.
      </p>

      {error ? <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={onRefresh}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#00a884] hover:underline disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Refresh
      </button>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-[#f0f2f5] p-4">
          <p className="text-xs text-[#667781] uppercase font-semibold flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" /> Registered number
          </p>
          <p className="font-semibold text-[#111b21] mt-1 font-mono">{channelPhone ?? "—"}</p>
        </div>
        <div className="rounded-xl bg-[#f0f2f5] p-4">
          <p className="text-xs text-[#667781] uppercase font-semibold">Channel status</p>
          <p className="font-semibold text-[#111b21] mt-1 capitalize">{channelStatus.replace(/_/g, " ")}</p>
        </div>
      </div>

      {phone || business ? (
        <div className="rounded-xl border border-[#00a884]/30 bg-[#00a884]/5 p-4 space-y-2 text-sm">
          <p className="font-semibold text-[#111b21]">Videh channel identifiers</p>
          {phone ? (
            <p>
              Phone Number ID: <code className="text-[#00a884] text-xs bg-white px-1.5 py-0.5 rounded">{phone}</code>
            </p>
          ) : null}
          {business ? (
            <p>
              Business Account ID:{" "}
              <code className="text-[#00a884] text-xs bg-white px-1.5 py-0.5 rounded">{business}</code>
            </p>
          ) : null}
          <p className="text-xs text-[#667781] pt-1">
            Use Phone Number ID in <code>POST /v1/&#123;phone-number-id&#125;/messages</code> once API access is active.
          </p>
        </div>
      ) : (
        <p className="text-sm text-[#667781] rounded-xl bg-[#f0f2f5] p-4">
          Channel IDs are assigned during Videh review. Status:{" "}
          <strong>{PORTAL_STATUS_LABELS[data?.lead.status ?? ""] ?? data?.lead.status ?? "In review"}</strong>.
        </p>
      )}
    </section>
  );
}

export function DeveloperTemplatesPanel({
  data,
  busy,
  error,
  leadId,
  reference,
  onRefresh,
  onError,
  onReload,
}: PanelProps) {
  const [newTpl, setNewTpl] = useState(emptyTpl);
  const [submitting, setSubmitting] = useState(false);

  const submitTemplate = async () => {
    const id = leadId.trim();
    if (!id) return;
    const ref = reference.trim();
    if (!newTpl.templateKey.trim() || !newTpl.bodyText.trim()) {
      onError("Template key and message body are required.");
      return;
    }
    setSubmitting(true);
    onError("");
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
      await onReload();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not submit template");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-6">
      <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">Message templates</p>
      <h2 className="text-2xl font-bold text-[#111b21]">Create &amp; submit templates</h2>
      <p className="text-sm text-[#667781]">
        Submit utility or marketing templates here. Videh admin approves or rejects them (typically 24–72 hours). You
        can submit templates while your application is in review.
      </p>

      {error ? <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={onRefresh}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#00a884] hover:underline disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Refresh list
      </button>

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
          disabled={submitting}
          onClick={() => void submitTemplate()}
          className="bg-[#00a884] text-white font-semibold px-5 py-2.5 rounded-xl disabled:opacity-60 text-sm"
        >
          {submitting ? "Submitting…" : "Submit for approval"}
        </button>
      </div>

      <div>
        <p className="font-semibold text-[#111b21] mb-3">
          Your templates ({data?.approvedCount ?? 0} approved)
        </p>
        {!data?.templates.length ? (
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
                        t.status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function DeveloperApiPanel({ data, busy, error, onRefresh }: PanelProps) {
  const phone = phoneId(data);
  const business = businessId(data);

  return (
    <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-5">
      <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">API access</p>
      <h2 className="text-2xl font-bold text-[#111b21] flex items-center gap-2">
        <Key className="h-7 w-7 text-[#00a884]" />
        Production credentials
      </h2>
      <p className="text-sm text-[#667781]">
        API keys are issued after Videh approves your application. Use them with your Phone Number ID from Business
        channel.
      </p>

      {error ? <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={onRefresh}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#00a884] hover:underline disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Refresh
      </button>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-[#f0f2f5] p-4">
          <p className="text-xs text-[#667781] uppercase font-semibold">Application status</p>
          <p className="font-semibold text-[#111b21] mt-1">
            {PORTAL_STATUS_LABELS[data?.lead.status ?? ""] ?? data?.lead.status ?? "—"}
          </p>
        </div>
        <div className="rounded-xl bg-[#f0f2f5] p-4">
          <p className="text-xs text-[#667781] uppercase font-semibold">Plan</p>
          <p className="font-semibold text-[#111b21] mt-1">{data?.lead.plan_id ?? "—"}</p>
        </div>
      </div>

      {data?.account ? (
        <div className="rounded-xl border border-[#00a884]/30 bg-[#00a884]/5 p-4 space-y-2 text-sm">
          <p className="font-semibold text-[#111b21]">Production API credentials</p>
          <p>
            API Key ID: <code className="bg-white px-1.5 py-0.5 rounded text-xs">{data.account.api_key_id}</code>
          </p>
          <p className="text-[#667781]">
            Billing status: <strong>{data.account.billing_status}</strong>. API secret was shown once at approval —
            email developer@videh.co.in to rotate.
          </p>
          {phone ? (
            <p>
              Phone Number ID: <code className="text-[#00a884] text-xs">{phone}</code>
            </p>
          ) : null}
          {business ? (
            <p>
              Business Account ID: <code className="text-[#00a884] text-xs">{business}</code>
            </p>
          ) : null}
          <p className="text-xs text-[#667781] pt-2">
            Base URL: <code>/v1</code> · <code>GET /v1/me</code> ·{" "}
            <code>POST /v1/&#123;phone-number-id&#125;/messages</code>
          </p>
        </div>
      ) : (
        <p className="text-sm text-[#667781] rounded-xl bg-[#f0f2f5] p-4">
          API keys will appear here after full approval. You can still submit templates and track channel setup in the
          meantime.
        </p>
      )}
    </section>
  );
}

export function DeveloperBillingPanel({ data, busy, error, onRefresh }: PanelProps) {
  return (
    <section className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-5">
      <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">Billing &amp; usage</p>
      <h2 className="text-2xl font-bold text-[#111b21] flex items-center gap-2">
        <BarChart3 className="h-7 w-7 text-[#00a884]" />
        Usage &amp; invoices
      </h2>

      {error ? <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p> : null}

      <button
        type="button"
        disabled={busy}
        onClick={onRefresh}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#00a884] hover:underline disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Refresh
      </button>

      {data?.account ? (
        <div className="space-y-4 text-sm">
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
            Conversations this month — user-initiated: {data.account.conv_user_initiated_month ?? 0}, marketing:{" "}
            {data.account.conv_business_marketing_month ?? 0}, utility: {data.account.conv_business_utility_month ?? 0},
            free tier used: {data.account.conv_free_user_used_month ?? 0}
          </p>
        </div>
      ) : (
        <p className="text-sm text-[#667781] rounded-xl bg-[#f0f2f5] p-4">
          Billing and usage metrics appear after your application is approved and the API account is created. Your plan:{" "}
          <strong>{data?.lead.plan_id ?? "—"}</strong>
          {data?.lead.payment_method_verified ? " · Payment method verified" : ""}.
        </p>
      )}
    </section>
  );
}
