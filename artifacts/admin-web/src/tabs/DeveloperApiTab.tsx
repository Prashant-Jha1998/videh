import { useCallback, useEffect, useState } from "react";
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
  paid: "Paid — needs review",
  documents_review: "Documents review",
  channel_setup: "Channel setup",
  templates_review: "Templates review",
  approved: "Approved",
  rejected: "Rejected",
};

const NEXT_STATUS: Record<string, string> = {
  paid: "documents_review",
  documents_review: "channel_setup",
  channel_setup: "templates_review",
  templates_review: "approved",
};

export function DeveloperApiTab({ onErr }: { onErr: (m: string) => void }) {
  const [view, setView] = useState<"applications" | "accounts">("applications");
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
  const [newTpl, setNewTpl] = useState({
    templateKey: "",
    name: "",
    category: "utility",
    language: "en",
    bodyText: "",
    variables: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === "applications") {
        const data = await adminApi<{ leads: Lead[] }>(`/admin/developer-leads?status=${filter}`);
        setLeads(data.leads ?? []);
      } else {
        const data = await adminApi<{ accounts: ApiAccount[] }>("/admin/developer-accounts");
        setAccounts(data.accounts ?? []);
      }
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter, onErr, view]);

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

  const createTemplate = async (leadId: number) => {
    if (!newTpl.templateKey.trim() || !newTpl.bodyText.trim()) {
      onErr("Template key and body text required");
      return;
    }
    try {
      await adminApi(`/admin/developer-leads/${leadId}/templates`, {
        method: "POST",
        body: JSON.stringify({
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
      setNewTpl({ templateKey: "", name: "", category: "utility", language: "en", bodyText: "", variables: "" });
      await loadDetail(leadId);
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Could not create template");
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
      if (detailId) await loadDetail(detailId);
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Template update failed");
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Developer API</h2>
      <p className="muted">
        Review applications (documents, profile, payment) and manage live API accounts (usage, billing hold).
      </p>

      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          type="button"
          className={view === "applications" ? "nav-btn active" : "nav-btn"}
          style={{ width: "auto", padding: "6px 12px" }}
          onClick={() => setView("applications")}
        >
          Applications
        </button>
        <button
          type="button"
          className={view === "accounts" ? "nav-btn active" : "nav-btn"}
          style={{ width: "auto", padding: "6px 12px" }}
          onClick={() => setView("accounts")}
        >
          Live APIs
        </button>
        <button type="button" className="btn" style={{ width: "auto", marginLeft: "auto" }} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {view === "applications" ? (
        <>
          <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {(["pending", "paid", "documents_review", "approved", "rejected", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={filter === s ? "nav-btn active" : "nav-btn"}
                style={{ width: "auto", padding: "6px 12px" }}
                onClick={() => setFilter(s)}
              >
                {s === "pending" ? "Pending" : s.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="muted">Loading…</p>
          ) : leads.length === 0 ? (
            <p className="muted">No applications in this filter.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {leads.map((lead) => (
                <div key={lead.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <strong>{lead.company_name || "(no name yet)"}</strong>
                      <span className="muted" style={{ marginLeft: 8 }}>
                        {lead.reference_code}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>
                      {STATUS_LABELS[lead.status] ?? lead.status}
                    </span>
                  </div>
                  <p className="muted" style={{ margin: "8px 0", fontSize: 13 }}>
                    {lead.contact_name} · {lead.email} · {lead.phone}
                    {lead.entity_type ? ` · ${lead.entity_type}` : ""}
                  </p>
                  <div className="grid-stats" style={{ marginTop: 8, gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
                    <div className="stat">
                      <b>{lead.plan_id ?? "—"}</b>
                      <span>Plan</span>
                    </div>
                    <div className="stat">
                      <b>{lead.payment_status ?? "—"}</b>
                      <span>Payment</span>
                    </div>
                    <div className="stat">
                      <b>{lead.wizard_step ?? "—"}</b>
                      <span>Wizard step</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={() => void loadDetail(lead.id)}>
                      View details
                    </button>
                    {NEXT_STATUS[lead.status] ? (
                      <button type="button" className="btn" style={{ width: "auto" }} onClick={() => advance(lead)}>
                        Approve → {STATUS_LABELS[NEXT_STATUS[lead.status]!]}
                      </button>
                    ) : null}
                    {lead.status !== "rejected" && lead.status !== "approved" ? (
                      <button type="button" className="btn" style={{ width: "auto" }} onClick={() => reject(lead)}>
                        Reject
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : loading ? (
        <p className="muted">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="muted">No live API accounts yet. Approve an application to create keys.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {accounts.map((a) => (
            <div key={a.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <strong>{a.display_name ?? a.company_name}</strong>
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {a.reference_code}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: a.billing_status === "active" ? "var(--ok)" : "var(--err)",
                  }}
                >
                  Billing: {a.billing_status}
                </span>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: "8px 0" }}>
                Key: <code>{a.api_key_id}</code>
                {a.email ? ` · ${a.email}` : ""}
              </p>
              <div className="grid-stats" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
                <div className="stat">
                  <b>{a.messages_sent_total ?? 0}</b>
                  <span>Messages total</span>
                </div>
                <div className="stat">
                  <b>{a.messages_sent_month ?? 0}</b>
                  <span>This month</span>
                </div>
                <div className="stat">
                  <b>₹{((a.usage_billing_month_inr ?? 0) / 100).toFixed(2)}</b>
                  <span>Usage (mo)</span>
                </div>
                <div className="stat">
                  <b>{a.conv_free_user_used_month ?? 0}/100</b>
                  <span>Free tier used</span>
                </div>
                <div className="stat">
                  <b>{a.plan_id ?? "—"}</b>
                  <span>Plan</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button type="button" className="btn" style={{ width: "auto" }} onClick={() => void loadDetail(a.lead_id)}>
                  Application
                </button>
                {a.billing_status !== "active" ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: "auto" }}
                    onClick={() => void updateAccountBilling(a.id, "active")}
                  >
                    Release API (active)
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    style={{ width: "auto" }}
                    onClick={() => void updateAccountBilling(a.id, "hold")}
                  >
                    Hold API (payment failed)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && detailId ? (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => {
            setDetail(null);
            setDetailId(null);
          }}
        >
          <div
            className="card"
            style={{ maxWidth: 720, width: "100%", maxHeight: "90vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>
              {detail.lead.company_name} <span className="muted">{detail.lead.reference_code}</span>
            </h3>
            {detail.lead.logo_url ? (
              <img src={detail.lead.logo_url} alt="" style={{ height: 48, borderRadius: 8, marginBottom: 12 }} />
            ) : null}

            <p className="muted" style={{ fontSize: 13 }}>
              Status: <strong>{detail.lead.status}</strong> · Payment: <strong>{detail.lead.payment_status}</strong>
              {detail.lead.payment_method_verified ? " ✓ verified" : " ✗ not verified"} · Entity:{" "}
              <strong>{detail.lead.entity_type}</strong>
            </p>

            <h4>Business profile</h4>
            <ul style={{ fontSize: 13, margin: "0 0 12px" }}>
              <li>Display name: {detail.lead.display_name ?? "—"}</li>
              <li>Category: {detail.lead.business_category ?? "—"}</li>
              <li>GSTIN: {detail.lead.gstin ?? "—"}</li>
              <li>CIN / LLPIN / Udyam: {[detail.lead.cin, detail.lead.llpin, detail.lead.udyam].filter(Boolean).join(" · ") || "—"}</li>
              <li>Address: {detail.lead.business_address ?? "—"}</li>
              <li>Description: {detail.lead.business_description ?? "—"}</li>
            </ul>

            <h4>Business channel (Phone Number ID)</h4>
            <p style={{ fontSize: 13, marginBottom: 8 }}>
              Status: <strong>{detail.lead.channel_status ?? "none"}</strong>
              {detail.lead.channel_phone ? ` · Phone: ${detail.lead.channel_phone}` : ""}
            </p>
            {detail.lead.videh_phone_number_id ? (
              <ul style={{ fontSize: 13, margin: "0 0 12px" }}>
                <li>
                  Phone Number ID: <code>{detail.lead.videh_phone_number_id}</code>
                </li>
                <li>
                  Business Account ID: <code>{detail.lead.videh_business_account_id}</code>
                </li>
              </ul>
            ) : (
              <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Applicant must verify dedicated number via OTP in the application console.
              </p>
            )}
            {detail.lead.channel_status !== "verified" ? (
              <button
                type="button"
                className="btn"
                style={{ width: "auto", marginBottom: 12 }}
                onClick={() => void manualVerifyChannel(detail.lead.id)}
              >
                Admin: mark channel verified
              </button>
            ) : null}

            <h4>Documents</h4>
            <ul style={{ fontSize: 13 }}>
              {detail.requiredDocuments.map((req) => {
                const doc = detail.documents.find((d) => d.doc_type === req.key);
                return (
                  <li key={req.key} style={{ marginBottom: 6 }}>
                    {req.label} {req.required ? "*" : ""}:{" "}
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

            {detail.account ? (
              <>
                <h4>API account</h4>
                <p style={{ fontSize: 13 }}>
                  Key ID: <code>{detail.account.api_key_id}</code> · Billing: {detail.account.billing_status} · Sent:{" "}
                  {detail.account.messages_sent_total ?? 0} · Billed: ₹{detail.account.total_billed_inr ?? 0}
                </p>
              </>
            ) : null}

            <h4>Message templates</h4>
            <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
              Companies call templates by <code>name</code> (template_key) in POST /v1/business-messages. Approve before
              go-live.
            </p>
            {detail.templates.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>No templates yet.</p>
            ) : (
              <ul style={{ fontSize: 13, marginBottom: 12 }}>
                {detail.templates.map((t) => (
                  <li key={t.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
                    <strong className="font-mono">{t.template_key}</strong> — {t.name}{" "}
                    <span className="muted">
                      ({t.category}, {t.language}) · {t.status}
                    </span>
                    <p className="muted" style={{ margin: "4px 0" }}>
                      {t.body_preview ?? t.body_text.slice(0, 100)}
                    </p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {t.status !== "approved" ? (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
                          onClick={() => void patchTemplate(t.id, "approved")}
                        >
                          Approve
                        </button>
                      ) : null}
                      {t.status !== "rejected" ? (
                        <button
                          type="button"
                          className="btn"
                          style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
                          onClick={() => void patchTemplate(t.id, "rejected")}
                        >
                          Reject
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Add template</p>
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  placeholder="template_key e.g. order_update"
                  value={newTpl.templateKey}
                  onChange={(e) => setNewTpl((s) => ({ ...s, templateKey: e.target.value }))}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <input
                  placeholder="Display name"
                  value={newTpl.name}
                  onChange={(e) => setNewTpl((s) => ({ ...s, name: e.target.value }))}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <select
                  value={newTpl.category}
                  onChange={(e) => setNewTpl((s) => ({ ...s, category: e.target.value }))}
                  style={{ padding: 8, borderRadius: 8 }}
                >
                  <option value="utility">utility</option>
                  <option value="marketing">marketing</option>
                  <option value="authentication">authentication</option>
                  <option value="service">service</option>
                </select>
                <textarea
                  placeholder="Body text with {{1}} {{2}} placeholders"
                  value={newTpl.bodyText}
                  onChange={(e) => setNewTpl((s) => ({ ...s, bodyText: e.target.value }))}
                  rows={3}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <input
                  placeholder="Variables comma-separated: customer_name, order_id"
                  value={newTpl.variables}
                  onChange={(e) => setNewTpl((s) => ({ ...s, variables: e.target.value }))}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "auto" }}
                  onClick={() => void createTemplate(detail.lead.id)}
                >
                  Save template
                </button>
              </div>
            </div>

            {apiSecretOnce ? (
              <p style={{ fontSize: 12, color: "var(--warn)" }}>API secret was shown once on approval.</p>
            ) : null}

            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              {NEXT_STATUS[detail.lead.status] ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "auto" }}
                  onClick={() => void updateLead(detail.lead.id, { status: NEXT_STATUS[detail.lead.status] })}
                >
                  Approve next step
                </button>
              ) : null}
              <button type="button" className="btn" style={{ width: "auto" }} onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}