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
  plan_id?: string;
  amount_inr?: number;
  payment_status?: string;
  payment_method?: string;
  razorpay_payment_id?: string;
  paid_at?: string;
  status: string;
  approval_phase?: string;
  admin_notes?: string;
  assigned_admin?: string;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi<{ leads: Lead[] }>(`/admin/developer-leads?status=${filter}`);
      setLeads(data.leads ?? []);
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter, onErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateLead = async (id: number, patch: { status?: string; adminNotes?: string; approvalPhase?: string }) => {
    try {
      await adminApi(`/admin/developer-leads/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Update failed");
    }
  };

  const advance = (lead: Lead) => {
    const next = NEXT_STATUS[lead.status];
    if (!next) return;
    void updateLead(lead.id, { status: next, approvalPhase: next.replace("_review", "").replace("_setup", "_setup") });
  };

  const reject = (lead: Lead) => {
    const note = window.prompt("Reject reason (required)")?.trim();
    if (!note) return;
    void updateLead(lead.id, { status: "rejected", adminNotes: note });
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Developer API applications</h2>
      <p className="muted">
        Card/debit payment verification via Razorpay, then manual approval for documents, channel, and templates.
      </p>

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
        <button type="button" className="btn" style={{ width: "auto" }} onClick={() => void load()}>
          Refresh
        </button>
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
                  <strong>{lead.company_name}</strong>
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {lead.reference_code}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      lead.status === "approved"
                        ? "var(--ok)"
                        : lead.status === "rejected"
                          ? "var(--err)"
                          : "var(--accent)",
                  }}
                >
                  {STATUS_LABELS[lead.status] ?? lead.status}
                </span>
              </div>

              <p className="muted" style={{ margin: "8px 0", fontSize: 13 }}>
                {lead.contact_name} · {lead.email} · {lead.phone}
                {lead.gstin ? ` · GST ${lead.gstin}` : ""}
              </p>

              <div className="grid-stats" style={{ marginTop: 8, gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                <div className="stat">
                  <b>{lead.plan_id ?? "—"}</b>
                  <span>Plan</span>
                </div>
                <div className="stat">
                  <b>{lead.amount_inr ? `₹${lead.amount_inr}` : "Custom"}</b>
                  <span>Amount</span>
                </div>
                <div className="stat">
                  <b>{lead.payment_status ?? "—"}</b>
                  <span>Payment</span>
                </div>
                <div className="stat">
                  <b>{lead.payment_method ?? "—"}</b>
                  <span>Method</span>
                </div>
              </div>

              {lead.admin_notes ? (
                <p style={{ fontSize: 13, marginTop: 8 }}>
                  <strong>Notes:</strong> {lead.admin_notes}
                </p>
              ) : null}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {NEXT_STATUS[lead.status] ? (
                  <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={() => advance(lead)}>
                    Approve → {STATUS_LABELS[NEXT_STATUS[lead.status]!] ?? NEXT_STATUS[lead.status]}
                  </button>
                ) : null}
                {lead.status !== "rejected" && lead.status !== "approved" ? (
                  <button type="button" className="btn" style={{ width: "auto" }} onClick={() => reject(lead)}>
                    Reject
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn"
                  style={{ width: "auto" }}
                  onClick={() => {
                    const note = window.prompt("Admin note", lead.admin_notes ?? "") ?? "";
                    if (note !== "") void updateLead(lead.id, { adminNotes: note });
                  }}
                >
                  Add note
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
