import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../adminApi";

type Lead = {
  id: number;
  reference_code: string;
  company_name: string;
  entity_type: string;
  contact_name: string;
  email: string;
  phone: string;
  website?: string;
  gstin?: string;
  cin?: string;
  llpin?: string;
  udyam?: string;
  plan_id?: string;
  amount_inr?: number;
  payment_status?: string;
  payment_method_verified?: boolean;
  payment_method?: string;
  razorpay_payment_id?: string;
  paid_at?: string;
  status: string;
  approval_phase?: string;
  wizard_step?: string;
  display_name?: string;
  business_category?: string;
  business_description?: string;
  business_address?: string;
  logo_url?: string;
  admin_notes?: string;
  assigned_admin?: string;
  created_at: string;
  channel_phone?: string;
  channel_status?: string;
  videh_phone_number_id?: string;
  videh_business_account_id?: string;
  pending_template_count?: number;
};

type PendingTemplate = MessageTemplate & {
  reference_code: string;
  company_name: string;
  display_name?: string;
  lead_status: string;
  lead_email?: string;
  submitted_at?: string;
};

type LeadDoc = {
  id: number;
  doc_type: string;
  file_name: string;
  file_path: string;
  uploaded_at: string;
};

type MessageTemplate = {
  id: number;
  lead_id: number;
  template_key: string;
  name: string;
  category: string;
  language: string;
  body_text: string;
  body_preview?: string;
  variables_json?: unknown;
  status: string;
  rejection_reason?: string;
};

type ApiAccount = {
  id: number;
  lead_id: number;
  reference_code: string;
  company_name: string;
  display_name?: string;
  logo_url?: string;
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
  last_payment_at?: string;
  last_payment_failed_at?: string;
  email?: string;
  phone?: string;
  entity_type?: string;
  gstin?: string;
  payment_status?: string;
  lead_status?: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  payment_pending: "Awaiting payment",
  paid: "Paid — review",
  documents_review: "Documents review",
  channel_setup: "Channel setup",
  templates_review: "Templates review",
  approved: "Approved",
  suspended: "Suspended",
  rejected: "Rejected",
};

const FILTER_LABELS: Record<string, string> = {
  pending: "Pending review",
  paid: "Paid",
  documents_review: "Documents",
  approved: "Approved",
  suspended: "Suspended",
  rejected: "Rejected",
  all: "All",
};

const NEXT_STATUS: Record<string, string> = {
  paid: "documents_review",
  documents_review: "channel_setup",
  channel_setup: "templates_review",
  templates_review: "approved",
};

function statusBadgeClass(status: string): string {
  if (status === "approved") return "dev-badge dev-badge--ok";
  if (status === "suspended") return "dev-badge dev-badge--warn";
  if (status === "rejected") return "dev-badge dev-badge--err";
  if (status === "paid" || status === "documents_review" || status === "templates_review") {
    return "dev-badge dev-badge--info";
  }
  return "dev-badge dev-badge--muted";
}

function paymentLabel(lead: Lead): string {
  if (lead.payment_method_verified) return "Verified";
  const map: Record<string, string> = {
    method_verified: "Verified",
    pending: "Pending",
    paid: "Paid",
    waived: "Waived",
    failed: "Failed",
    none: "Not started",
  };
  const raw = lead.payment_status ?? "";
  return map[raw] ?? (raw.replace(/_/g, " ") || "—");
}

function wizardStepLabel(step?: string): string {
  const map: Record<string, string> = {
    plan: "Plan",
    company: "Company",
    documents: "Documents",
    profile: "Profile",
    channel: "Phone",
    payment: "Payment",
    done: "Submitted",
  };
  return map[step ?? ""] ?? step?.replace(/_/g, " ") ?? "—";
}

function entityLabel(t?: string): string {
  const map: Record<string, string> = {
    pvt_ltd: "Pvt Ltd",
    llp: "LLP",
    proprietorship: "Proprietorship",
    partnership: "Partnership",
    other: "Other",
  };
  return map[t ?? ""] ?? t ?? "";
}

function billingLabel(s: string): string {
  const map: Record<string, string> = {
    active: "Active",
    hold: "On hold",
    past_due: "Past due",
    suspended: "Suspended",
  };
  return map[s] ?? s;
}

function planLabel(id?: string): string {
  if (!id) return "—";
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function StatusBadge({ status }: { status: string }) {
  return <span className={statusBadgeClass(status)}>{STATUS_LABELS[status] ?? status}</span>;
}

function ApplicationCard({
  lead,
  onDetail,
  onAdvance,
  onReject,
  onSuspend,
  onReactivate,
  onDelete,
  onTemplates,
}: {
  lead: Lead;
  onDetail: () => void;
  onAdvance: () => void;
  onReject: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onDelete: () => void;
  onTemplates?: () => void;
}) {
  const name = lead.company_name || lead.display_name || "(Unnamed company)";
  const initial = name.charAt(0).toUpperCase();
  const payOk = lead.payment_method_verified || lead.payment_status === "method_verified";

  return (
    <article className="dev-app-card">
      <div className="dev-app-card__head">
        <div className="dev-app-card__title">
          {lead.logo_url ? (
            <img src={lead.logo_url} alt="" className="dev-app-logo" />
          ) : (
            <div className="dev-app-logo dev-app-logo--placeholder" aria-hidden>
              {initial}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <h3>{name}</h3>
            <span className="dev-app-card__ref">{lead.reference_code}</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <StatusBadge status={lead.status} />
          {(lead.pending_template_count ?? 0) > 0 ? (
            <button type="button" className="dev-template-pending-badge" onClick={onTemplates}>
              {lead.pending_template_count} template{(lead.pending_template_count ?? 0) === 1 ? "" : "s"} pending
            </button>
          ) : null}
        </div>
      </div>

      <div className="dev-meta-row">
        {lead.contact_name ? (
          <span className="dev-meta-chip">
            <strong>{lead.contact_name}</strong>
          </span>
        ) : null}
        <span className="dev-meta-chip">{lead.email}</span>
        {lead.phone ? <span className="dev-meta-chip">{lead.phone}</span> : null}
        {lead.entity_type ? <span className="dev-meta-chip">{entityLabel(lead.entity_type)}</span> : null}
      </div>

      <div className="dev-metrics">
        <div className="dev-metric">
          <b>{planLabel(lead.plan_id)}</b>
          <span>Plan</span>
        </div>
        <div className={`dev-metric${payOk ? " dev-metric--ok" : ""}`}>
          <b>{paymentLabel(lead)}</b>
          <span>Payment</span>
        </div>
        <div className="dev-metric">
          <b>{wizardStepLabel(lead.wizard_step)}</b>
          <span>Onboarding</span>
        </div>
      </div>

      <div className="dev-actions">
        <div className="dev-actions__group">
          <button type="button" className="btn-sm btn-sm-primary" onClick={onDetail}>
            View details
          </button>
          {NEXT_STATUS[lead.status] ? (
            <button type="button" className="btn-sm" onClick={onAdvance}>
              Advance → {STATUS_LABELS[NEXT_STATUS[lead.status]!]}
            </button>
          ) : null}
          {lead.status === "suspended" ? (
            <button type="button" className="btn-sm btn-sm-primary" onClick={onReactivate}>
              Reactivate
            </button>
          ) : null}
          {lead.status === "approved" ? (
            <button type="button" className="btn-sm btn-sm-warn" onClick={onSuspend}>
              Suspend API
            </button>
          ) : null}
          {lead.status !== "rejected" && lead.status !== "approved" && lead.status !== "suspended" ? (
            <button type="button" className="btn-sm btn-sm-warn" onClick={onReject}>
              Reject
            </button>
          ) : null}
        </div>
        <div className="dev-actions__danger">
          <button type="button" className="btn-sm btn-sm-danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

export function DeveloperApiTab({
  onErr,
  onPendingTemplatesChange,
}: {
  onErr: (m: string) => void;
  onPendingTemplatesChange?: () => void;
}) {
  const [view, setView] = useState<"applications" | "template-queue" | "accounts">("applications");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [accounts, setAccounts] = useState<ApiAccount[]>([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    lead: Lead;
    documents: LeadDoc[];
    account: ApiAccount | null;
    requiredDocuments: { key: string; label: string; required: boolean }[];
    templates: MessageTemplate[];
  } | null>(null);
  const [apiSecretOnce, setApiSecretOnce] = useState<string | null>(null);
  const [pendingTemplates, setPendingTemplates] = useState<PendingTemplate[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const onPendingChangeRef = useRef(onPendingTemplatesChange);
  const lastPendingCountRef = useRef<number | null>(null);

  useEffect(() => {
    onPendingChangeRef.current = onPendingTemplatesChange;
  }, [onPendingTemplatesChange]);

  const loadPendingTemplates = useCallback(async () => {
    try {
      const data = await adminApi<{ templates: PendingTemplate[]; count: number }>(
        "/admin/developer-templates/pending",
      );
      const list = data.templates ?? [];
      const count = data.count ?? list.length;
      setPendingTemplates(list);
      setPendingCount(count);
      if (lastPendingCountRef.current !== count) {
        lastPendingCountRef.current = count;
        onPendingChangeRef.current?.();
      }
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Could not load pending templates");
    }
  }, [onErr]);

  const load = useCallback(async () => {
    if (view === "template-queue") {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (view === "applications") {
        const data = await adminApi<{ leads: Lead[] }>(`/admin/developer-leads?status=${filter}`);
        setLeads(data.leads ?? []);
      } else if (view === "accounts") {
        const data = await adminApi<{ accounts: ApiAccount[] }>("/admin/developer-accounts");
        setAccounts(data.accounts ?? []);
      }
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter, onErr, view]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadPendingTemplates(), load()]);
  }, [load, loadPendingTemplates]);

  useEffect(() => {
    void loadPendingTemplates();
  }, [loadPendingTemplates]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDetail = async (id: number) => {
    try {
      const data = await adminApi<{
        lead: Lead;
        documents: LeadDoc[];
        account: ApiAccount | null;
        requiredDocuments: { key: string; label: string; required: boolean }[];
        templates?: MessageTemplate[];
      }>(`/admin/developer-leads/${id}`);
      setDetail({
        lead: data.lead,
        documents: data.documents ?? [],
        account: data.account ?? null,
        requiredDocuments: data.requiredDocuments ?? [],
        templates: data.templates ?? [],
      });
      setDetailId(id);
      setApiSecretOnce(null);
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Could not load details");
    }
  };

  const updateLead = async (id: number, patch: { status?: string; adminNotes?: string; approvalPhase?: string }) => {
    try {
      const data = await adminApi<{ lead: Lead; apiSecretOnce?: string | null }>(`/admin/developer-leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (data.apiSecretOnce) {
        setApiSecretOnce(data.apiSecretOnce);
        window.alert(`API secret (show once): ${data.apiSecretOnce}`);
      }
      await load();
      if (detailId === id) await loadDetail(id);
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Update failed");
    }
  };

  const updateAccountBilling = async (accountId: number, billingStatus: string) => {
    try {
      await adminApi(`/admin/developer-accounts/${accountId}`, {
        method: "PATCH",
        body: JSON.stringify({ billingStatus }),
      });
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Billing update failed");
    }
  };

  const advance = (lead: Lead) => {
    const next = NEXT_STATUS[lead.status];
    if (!next) return;
    void updateLead(lead.id, { status: next, approvalPhase: next });
  };

  const reject = (lead: Lead) => {
    const note = window.prompt("Reject reason (required)")?.trim();
    if (!note) return;
    void updateLead(lead.id, { status: "rejected", adminNotes: note });
  };

  const suspendLead = (lead: Lead) => {
    const note = window.prompt("Suspend reason (optional)")?.trim();
    if (!window.confirm(`Suspend ${lead.reference_code}? API access will be blocked until you reactivate.`)) return;
    void updateLead(lead.id, {
      status: "suspended",
      adminNotes: note ? `${lead.admin_notes ? `${lead.admin_notes}\n` : ""}[Suspended] ${note}` : lead.admin_notes,
    });
  };

  const reactivateLead = (lead: Lead) => {
    if (!window.confirm(`Reactivate ${lead.reference_code} and restore API access?`)) return;
    void updateLead(lead.id, { status: "approved" });
  };

  const deleteLead = async (lead: Lead) => {
    if (
      !window.confirm(
        `Permanently delete "${lead.company_name || lead.reference_code}" (${lead.reference_code})?\n\nThis removes the application, API account, templates, and files. Cannot be undone.`,
      )
    ) {
      return;
    }
    const typed = window.prompt(`Type DELETE to confirm removal of ${lead.reference_code}`)?.trim();
    if (typed !== "DELETE") {
      onErr("Deletion cancelled — type DELETE to confirm.");
      return;
    }
    try {
      await adminApi(`/admin/developer-leads/${lead.id}`, { method: "DELETE" });
      if (detailId === lead.id) {
        setDetail(null);
        setDetailId(null);
      }
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const manualVerifyChannel = async (leadId: number) => {
    const phone = window.prompt("Channel phone (10 digits)", "")?.trim();
    if (!phone) return;
    try {
      await adminApi(`/admin/developer-leads/${leadId}/channel`, {
        method: "PATCH",
        body: JSON.stringify({ channelPhone: phone, manualVerify: true }),
      });
      await loadDetail(leadId);
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Channel verify failed");
    }
  };

  const patchTemplate = async (templateId: number, status: string) => {
    try {
      const reason = status === "rejected" ? window.prompt("Rejection reason?")?.trim() : undefined;
      await adminApi(`/admin/developer-templates/${templateId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, rejectionReason: reason }),
      });
      await refreshAll();
      if (detailId) await loadDetail(detailId);
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Template update failed");
    }
  };

  const countLabel =
    view === "applications"
      ? loading
        ? "Loading…"
        : `${leads.length} application${leads.length === 1 ? "" : "s"}`
      : view === "template-queue"
        ? loading
          ? "Loading…"
          : `${pendingTemplates.length} pending template${pendingTemplates.length === 1 ? "" : "s"}`
        : loading
          ? "Loading…"
          : `${accounts.length} live account${accounts.length === 1 ? "" : "s"}`;

  return (
    <div className="dev-api-page">
      <header className="dev-api-header">
        <h2>Developer API</h2>
        <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
          Review partner applications, approve templates, and manage live API keys, billing, and access.
        </p>
      </header>

      {pendingCount > 0 ? (
        <div className="dev-template-alert" role="alert">
          <strong>{pendingCount} message template{pendingCount === 1 ? "" : "s"} awaiting your approval</strong>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Developers submitted these from the Business API console. Review and approve or reject below.
          </span>
          <button type="button" className="btn-sm btn-sm-primary" onClick={() => setView("template-queue")}>
            Open approval queue →
          </button>
        </div>
      ) : null}

      <div className="dev-api-toolbar">
        <div className="dev-segment">
          <button
            type="button"
            className={view === "applications" ? "active" : ""}
            onClick={() => setView("applications")}
          >
            Applications
          </button>
          <button
            type="button"
            className={view === "template-queue" ? "active" : ""}
            onClick={() => setView("template-queue")}
          >
            Template approvals
            {pendingCount > 0 ? <span className="dev-segment-badge">{pendingCount}</span> : null}
          </button>
          <button type="button" className={view === "accounts" ? "active" : ""} onClick={() => setView("accounts")}>
            Live APIs
          </button>
        </div>
        <span className="dev-count">{countLabel}</span>
        <button type="button" className="btn-sm btn-sm-ghost" style={{ marginLeft: "auto" }} onClick={() => void refreshAll()}>
          ↻ Refresh
        </button>
      </div>

      {view === "template-queue" ? (
        loading ? (
          <div className="dev-loading">Loading pending templates…</div>
        ) : pendingTemplates.length === 0 ? (
          <div className="dev-empty">
            <h3>No templates pending</h3>
            <p className="muted" style={{ margin: 0 }}>
              When a developer submits a message template for approval, it will appear here immediately.
            </p>
          </div>
        ) : (
          <ul className="dev-template-queue">
            {pendingTemplates.map((t) => (
              <li key={t.id} className="dev-template-queue__item">
                <div className="dev-template-queue__head">
                  <div>
                    <p className="dev-template-queue__company">{t.company_name || t.display_name || "—"}</p>
                    <p className="dev-template-queue__ref">
                      <span className="font-mono">{t.reference_code}</span>
                      {" · "}
                      {STATUS_LABELS[t.lead_status] ?? t.lead_status}
                      {t.lead_email ? ` · ${t.lead_email}` : ""}
                    </p>
                  </div>
                  <span className="dev-badge dev-badge--warn">Pending approval</span>
                </div>
                <div className="dev-template-queue__body">
                  <strong className="font-mono">{t.template_key}</strong>
                  <p className="muted" style={{ margin: "4px 0", fontSize: "0.85rem" }}>
                    {t.name} · {t.category} · {t.language}
                  </p>
                  <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                    {t.body_preview ?? t.body_text.slice(0, 200)}
                  </p>
                  {t.submitted_at ? (
                    <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.75rem" }}>
                      Submitted {new Date(t.submitted_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <div className="dev-actions" style={{ marginTop: 10, border: "none", padding: 0 }}>
                  <div className="dev-actions__group">
                    <button type="button" className="btn-sm btn-sm-primary" onClick={() => void patchTemplate(t.id, "approved")}>
                      Approve
                    </button>
                    <button type="button" className="btn-sm btn-sm-danger" onClick={() => void patchTemplate(t.id, "rejected")}>
                      Reject
                    </button>
                    <button type="button" className="btn-sm" onClick={() => void loadDetail(t.lead_id)}>
                      Open application
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {view === "applications" ? (
        <>
          <div className="dev-filters">
            {(["pending", "paid", "documents_review", "approved", "suspended", "rejected", "all"] as const).map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  className={`dev-filter-chip${filter === s ? " active" : ""}`}
                  onClick={() => setFilter(s)}
                >
                  {FILTER_LABELS[s] ?? s}
                </button>
              ),
            )}
          </div>

          {loading ? (
            <div className="dev-loading">Loading applications…</div>
          ) : leads.length === 0 ? (
            <div className="dev-empty">
              <h3>No applications here</h3>
              <p className="muted" style={{ margin: 0 }}>
                Try another filter, or wait for a new partner signup on developer.videh.co.in.
              </p>
            </div>
          ) : (
            <div className="dev-list">
              {leads.map((lead) => (
                <ApplicationCard
                  key={lead.id}
                  lead={lead}
                  onDetail={() => void loadDetail(lead.id)}
                  onAdvance={() => advance(lead)}
                  onReject={() => reject(lead)}
                  onSuspend={() => suspendLead(lead)}
                  onReactivate={() => reactivateLead(lead)}
                  onDelete={() => void deleteLead(lead)}
                  onTemplates={() => {
                    setView("template-queue");
                    void loadDetail(lead.id);
                  }}
                />
              ))}
            </div>
          )}
        </>
      ) : loading ? (
        <div className="dev-loading">Loading live accounts…</div>
      ) : accounts.length === 0 ? (
        <div className="dev-empty">
          <h3>No live API accounts</h3>
          <p className="muted" style={{ margin: 0 }}>
            Approve an application to issue API keys and show it here.
          </p>
        </div>
      ) : (
        <div className="dev-list">
          {accounts.map((a) => (
            <article key={a.id} className="dev-app-card">
              <div className="dev-app-card__head">
                <div className="dev-app-card__title">
                  <div className="dev-app-logo dev-app-logo--placeholder" aria-hidden>
                    {(a.display_name ?? a.company_name).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3>{a.display_name ?? a.company_name}</h3>
                    <span className="dev-app-card__ref">{a.reference_code}</span>
                  </div>
                </div>
                <span
                  className={`dev-badge ${
                    a.billing_status === "active" ? "dev-badge--ok" : a.billing_status === "suspended" ? "dev-badge--warn" : "dev-badge--err"
                  }`}
                >
                  {billingLabel(a.billing_status)}
                </span>
              </div>
              <div className="dev-meta-row">
                <span className="dev-meta-chip">
                  Key: <code style={{ fontSize: "0.75rem" }}>{a.api_key_id}</code>
                </span>
                {a.email ? <span className="dev-meta-chip">{a.email}</span> : null}
                <StatusBadge status={a.lead_status ?? "approved"} />
              </div>
              <div className="dev-metrics" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
                <div className="dev-metric">
                  <b>{a.messages_sent_total ?? 0}</b>
                  <span>Sent (total)</span>
                </div>
                <div className="dev-metric">
                  <b>{a.messages_sent_month ?? 0}</b>
                  <span>This month</span>
                </div>
                <div className="dev-metric">
                  <b>₹{((a.usage_billing_month_inr ?? 0) / 100).toFixed(0)}</b>
                  <span>Usage bill</span>
                </div>
                <div className="dev-metric">
                  <b>
                    {a.conv_free_user_used_month ?? 0}/100
                  </b>
                  <span>Free tier</span>
                </div>
                <div className="dev-metric">
                  <b>{planLabel(a.plan_id)}</b>
                  <span>Plan</span>
                </div>
              </div>
              <div className="dev-actions">
                <div className="dev-actions__group">
                  <button type="button" className="btn-sm" onClick={() => void loadDetail(a.lead_id)}>
                    Application
                  </button>
                  {a.billing_status !== "active" ? (
                    <button
                      type="button"
                      className="btn-sm btn-sm-primary"
                      onClick={() => void updateAccountBilling(a.id, "active")}
                    >
                      Activate billing
                    </button>
                  ) : (
                    <button type="button" className="btn-sm btn-sm-warn" onClick={() => void updateAccountBilling(a.id, "hold")}>
                      Hold billing
                    </button>
                  )}
                  {a.lead_status === "approved" ? (
                    <button
                      type="button"
                      className="btn-sm btn-sm-warn"
                      onClick={() => {
                        const lead = leads.find((l) => l.id === a.lead_id);
                        if (lead) suspendLead(lead);
                        else void updateLead(a.lead_id, { status: "suspended" });
                      }}
                    >
                      Suspend
                    </button>
                  ) : null}
                </div>
                <div className="dev-actions__danger">
                  <button
                    type="button"
                    className="btn-sm btn-sm-danger"
                    onClick={() => {
                      const lead =
                        leads.find((l) => l.id === a.lead_id) ??
                        ({
                          id: a.lead_id,
                          reference_code: a.reference_code,
                          company_name: a.company_name,
                          entity_type: a.entity_type ?? "",
                          contact_name: "",
                          email: a.email ?? "",
                          phone: a.phone ?? "",
                          status: a.lead_status ?? "approved",
                          created_at: "",
                        } as Lead);
                      void deleteLead(lead);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {detail && detailId ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setDetail(null);
            setDetailId(null);
          }}
        >
          <div className="modal-card" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {detail.lead.logo_url ? (
                  <img src={detail.lead.logo_url} alt="" className="dev-app-logo" />
                ) : null}
                <div>
                  <h3>{detail.lead.company_name || "(Unnamed)"}</h3>
                  <span className="dev-app-card__ref">{detail.lead.reference_code}</span>
                  <div style={{ marginTop: 8 }}>
                    <StatusBadge status={detail.lead.status} />
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-sm btn-sm-ghost modal-close"
                onClick={() => {
                  setDetail(null);
                  setDetailId(null);
                }}
              >
                ✕ Close
              </button>
            </div>

            <div className="dev-detail-section">
              <h4>Overview</h4>
              <dl className="dev-detail-grid">
                <dt>Payment</dt>
                <dd>{paymentLabel(detail.lead)}</dd>
                <dt>Entity</dt>
                <dd>{entityLabel(detail.lead.entity_type)}</dd>
                <dt>Contact</dt>
                <dd>
                  {detail.lead.contact_name || "—"} · {detail.lead.email} · {detail.lead.phone || "—"}
                </dd>
                <dt>Onboarding step</dt>
                <dd>{wizardStepLabel(detail.lead.wizard_step)}</dd>
                <dt>Display name</dt>
                <dd>{detail.lead.display_name ?? "—"}</dd>
                <dt>GSTIN</dt>
                <dd>{detail.lead.gstin ?? "—"}</dd>
              </dl>
            </div>

            <div className="dev-detail-section">
              <h4>Business channel</h4>
              <dl className="dev-detail-grid">
                <dt>Status</dt>
                <dd>{detail.lead.channel_status ?? "none"}</dd>
                <dt>Phone</dt>
                <dd>{detail.lead.channel_phone ?? "—"}</dd>
                <dt>Phone Number ID</dt>
                <dd>
                  <code>{detail.lead.videh_phone_number_id ?? "—"}</code>
                </dd>
                <dt>Business Account ID</dt>
                <dd>
                  <code>{detail.lead.videh_business_account_id ?? "—"}</code>
                </dd>
              </dl>
              {detail.lead.channel_status !== "verified" ? (
                <button
                  type="button"
                  className="btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => void manualVerifyChannel(detail.lead.id)}
                >
                  Mark channel verified (admin)
                </button>
              ) : null}
            </div>

            <div className="dev-detail-section">
              <h4>Compliance documents</h4>
              <ul style={{ fontSize: "0.85rem", margin: 0, paddingLeft: 18 }}>
                {detail.requiredDocuments.map((req) => {
                  const doc = detail.documents.find((d) => d.doc_type === req.key);
                  return (
                    <li key={req.key} style={{ marginBottom: 6 }}>
                      {req.label}
                      {req.required ? " *" : ""}:{" "}
                      {doc ? (
                        <a href={doc.file_path} target="_blank" rel="noreferrer">
                          {doc.file_name}
                        </a>
                      ) : (
                        <span style={{ color: "var(--err)" }}>Missing</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {detail.account ? (
              <div className="dev-detail-section">
                <h4>API account</h4>
                <dl className="dev-detail-grid">
                  <dt>Key ID</dt>
                  <dd>
                    <code>{detail.account.api_key_id}</code>
                  </dd>
                  <dt>Billing</dt>
                  <dd>{billingLabel(detail.account.billing_status)}</dd>
                  <dt>Messages sent</dt>
                  <dd>{detail.account.messages_sent_total ?? 0}</dd>
                </dl>
              </div>
            ) : null}

            <div className="dev-detail-section">
              <h4>
                Message templates
                {detail.templates.some((t) => t.status === "pending") ? (
                  <span className="dev-badge dev-badge--warn" style={{ marginLeft: 8, verticalAlign: "middle" }}>
                    {detail.templates.filter((t) => t.status === "pending").length} pending
                  </span>
                ) : null}
              </h4>
              <p className="muted" style={{ fontSize: "0.8rem", margin: "0 0 10px" }}>
                Developers submit from developer.videh.co.in. Approve or reject each template — pending items also appear
                in <strong>Template approvals</strong> queue.
              </p>
              {detail.templates.length === 0 ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>No templates submitted yet.</p>
              ) : (
                <ul style={{ fontSize: "0.85rem", margin: 0, padding: 0, listStyle: "none" }}>
                  {detail.templates.map((t) => (
                    <li
                      key={t.id}
                      style={{
                        marginBottom: 10,
                        padding: 10,
                        background: t.status === "pending" ? "rgba(245, 158, 11, 0.08)" : "var(--bg)",
                        borderRadius: 8,
                        border: t.status === "pending" ? "1px solid rgba(245, 158, 11, 0.45)" : "1px solid var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <strong className="font-mono">{t.template_key}</strong>
                        <span className={statusBadgeClass(t.status)} style={{ textTransform: "capitalize" }}>
                          {t.status}
                        </span>
                      </div>
                      <p className="muted" style={{ margin: "6px 0", fontSize: "0.8rem" }}>
                        {t.name} · {t.category} · {t.language}
                      </p>
                      <p className="muted" style={{ margin: "0 0 8px", fontSize: "0.78rem" }}>
                        {t.body_preview ?? t.body_text.slice(0, 120)}
                      </p>
                      <div style={{ display: "flex", gap: 6 }}>
                        {t.status !== "approved" ? (
                          <button
                            type="button"
                            className="btn-sm btn-sm-primary"
                            onClick={() => void patchTemplate(t.id, "approved")}
                          >
                            Approve
                          </button>
                        ) : null}
                        {t.status !== "rejected" ? (
                          <button type="button" className="btn-sm btn-sm-danger" onClick={() => void patchTemplate(t.id, "rejected")}>
                            Reject
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {apiSecretOnce ? (
              <p style={{ fontSize: "0.8rem", color: "var(--warn)", marginBottom: 12 }}>
                API secret was shown once on approval.
              </p>
            ) : null}

            <div className="dev-actions" style={{ borderRadius: 8, marginTop: 8 }}>
              <div className="dev-actions__group">
                {NEXT_STATUS[detail.lead.status] ? (
                  <button
                    type="button"
                    className="btn-sm btn-sm-primary"
                    onClick={() => void updateLead(detail.lead.id, { status: NEXT_STATUS[detail.lead.status] })}
                  >
                    Advance → {STATUS_LABELS[NEXT_STATUS[detail.lead.status]!]}
                  </button>
                ) : null}
                {detail.lead.status === "approved" ? (
                  <button type="button" className="btn-sm btn-sm-warn" onClick={() => suspendLead(detail.lead)}>
                    Suspend API
                  </button>
                ) : null}
                {detail.lead.status === "suspended" ? (
                  <button type="button" className="btn-sm btn-sm-primary" onClick={() => reactivateLead(detail.lead)}>
                    Reactivate
                  </button>
                ) : null}
              </div>
              <div className="dev-actions__danger">
                <button type="button" className="btn-sm btn-sm-danger" onClick={() => void deleteLead(detail.lead)}>
                  Delete permanently
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
