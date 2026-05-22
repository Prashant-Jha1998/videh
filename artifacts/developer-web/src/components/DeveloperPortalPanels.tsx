import { BarChart3, Key, Loader2, Phone, RefreshCw } from "lucide-react";
import type { PortalData } from "../hooks/useDeveloperPortal";
import { PORTAL_STATUS_LABELS } from "../hooks/useDeveloperPortal";
import { BillingUsageMetrics } from "./BillingUsageMetrics";
import { DeveloperApiCredentials } from "./DeveloperApiCredentials";
import { DeveloperTemplateBuilder } from "./DeveloperTemplateBuilder";

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
  const businessName = data?.lead.company_name?.trim() || "Your Business";

  return (
    <section className="space-y-6">
      <div className="rounded-2xl bg-white p-6 md:p-8 shadow-sm border border-gray-200 space-y-3">
        <p className="text-xs font-semibold text-[#00a884] uppercase tracking-wide">Message templates</p>
        <h2 className="text-2xl font-bold text-[#111b21]">WhatsApp template studio</h2>
        <p className="text-sm text-[#667781] max-w-2xl">
          Build templates like WhatsApp Business Manager — header, body with {"{{1}}"} variables, footer, and buttons.
          Live preview shows exactly how the message will look to your customers. Videh admin approves before production
          send.
        </p>
        {error ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={onRefresh}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#00a884] hover:underline disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <DeveloperTemplateBuilder
        leadId={leadId}
        reference={reference}
        businessName={businessName}
        templates={data?.templates ?? []}
        onReload={onReload}
        onError={onError}
      />
    </section>
  );
}

export function DeveloperApiPanel({ data, busy, error, leadId, reference, onRefresh }: PanelProps) {
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
        You get two parts: <strong>Key ID</strong> (<code className="text-xs">vsk_…</code>) and{" "}
        <strong>Secret Key</strong> (<code className="text-xs">vsec_…</code>). Both are below — use Secret in{" "}
        <code className="text-xs">Authorization: Bearer</code> with your Phone Number ID from Business channel.
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
        <>
          <DeveloperApiCredentials
            leadId={leadId}
            reference={reference}
            apiKeyId={data.account.api_key_id}
            billingStatus={data.account.billing_status}
            phoneNumberId={phone ?? undefined}
            businessAccountId={business ?? undefined}
          />
          {phone || business ? (
            <div className="rounded-xl bg-[#f0f2f5] p-4 space-y-2 text-sm">
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
              <p className="text-xs text-[#667781] pt-1">
                Base URL: <code>/v1</code> · <code>GET /v1/me</code> ·{" "}
                <code>POST /v1/&#123;phone-number-id&#125;/messages</code>
              </p>
            </div>
          ) : null}
        </>
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
        <div className="text-sm">
          <BillingUsageMetrics account={data.account} />
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
