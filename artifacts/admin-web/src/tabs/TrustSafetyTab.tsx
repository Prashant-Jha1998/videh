import { useCallback, useEffect, useState } from "react";
import { adminApi, fmtDate, priorityBadge } from "../adminApi";
import { User360Modal } from "../components/User360Modal";

type Props = { onErr: (msg: string) => void };

export function TrustSafetyTab({ onErr }: Props) {
  const [reports, setReports] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [status, setStatus] = useState("open");
  const [user360, setUser360] = useState<number | null>(null);
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [rep, ev] = await Promise.all([
        adminApi<{ reports: any[] }>(`/admin/reports?status=${status}`),
        adminApi<{ events: any[] }>("/admin/moderation/events?limit=40"),
      ]);
      setReports(rep.reports);
      setEvents(ev.events);
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Failed to load trust & safety");
    }
  }, [status, onErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const assign = async (id: number) => {
    try {
      await adminApi(`/admin/reports/${id}/assign`, { method: "POST" });
      await load();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Assign failed");
    }
  };

  const submitResolve = async (dismiss: boolean) => {
    if (!resolveId || resolveNote.trim().length < 5) {
      onErr("Resolution note required (min 5 chars)");
      return;
    }
    try {
      await adminApi(`/admin/reports/${resolveId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution: resolveNote, dismiss }),
      });
      setResolveId(null);
      setResolveNote("");
      await load();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Resolve failed");
    }
  };

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Trust & Safety</h2>
      <p className="muted">
        Reports are ranked by priority algorithm (recency, duplicates, user risk, keywords). IT Rules grievance SLA is
        separate under Compliance.
      </p>

      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Report status{" "}
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All</option>
          </select>
        </label>
        <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Priority</th>
              <th>ID</th>
              <th>Reported</th>
              <th>Reporter</th>
              <th>Reason</th>
              <th>Risk</th>
              <th>Dup 7d</th>
              <th>Status</th>
              <th>When</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className={priorityBadge(Number(r.priority_score_computed ?? 0))}>
                    {r.priority_score_computed} ({r.priority_label})
                  </span>
                </td>
                <td>{r.id}</td>
                <td>
                  {r.reported_name ?? "—"}
                  <div className="muted">{r.reported_phone}</div>
                  {r.reported_user_id ? (
                    <button type="button" className="link-btn" onClick={() => setUser360(Number(r.reported_user_id))}>
                      User 360
                    </button>
                  ) : null}
                </td>
                <td>
                  {r.reporter_name}
                  <div className="muted">{r.reporter_phone}</div>
                </td>
                <td style={{ maxWidth: 200 }}>
                  <b>{r.reason}</b>
                  <div className="muted">{(r.details ?? "").slice(0, 80)}</div>
                </td>
                <td>{r.reported_user_risk}</td>
                <td>{r.duplicate_reports_7d}</td>
                <td>{r.status ?? "open"}</td>
                <td>{fmtDate(r.created_at)}</td>
                <td style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <button type="button" className="btn" style={{ width: "auto", padding: "4px 8px" }} onClick={() => void assign(Number(r.id))}>
                    Assign me
                  </button>
                  <button type="button" className="btn" style={{ width: "auto", padding: "4px 8px" }} onClick={() => setResolveId(Number(r.id))}>
                    Resolve
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {reports.length === 0 ? <p className="muted">No reports in this queue.</p> : null}
      </div>

      <h3>Moderation audit trail</h3>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Activity</th>
              <th>Reason</th>
              <th>Severity</th>
              <th>Action</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.name}
                  <div className="muted">{e.phone}</div>
                  <button type="button" className="link-btn" onClick={() => setUser360(Number(e.user_id))}>
                    360
                  </button>
                </td>
                <td>{e.activity_type}</td>
                <td style={{ maxWidth: 220 }}>{e.reason}</td>
                <td>{e.severity}</td>
                <td>{e.action_taken}</td>
                <td>{fmtDate(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {user360 ? <User360Modal userId={user360} onClose={() => setUser360(null)} onErr={onErr} /> : null}

      {resolveId ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Resolve report #{resolveId}</h3>
            <textarea value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} placeholder="Resolution note for audit…" />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={() => void submitResolve(false)}>
                Resolve
              </button>
              <button type="button" className="btn" style={{ width: "auto" }} onClick={() => void submitResolve(true)}>
                Dismiss
              </button>
              <button type="button" className="btn btn-ghost" style={{ width: "auto" }} onClick={() => setResolveId(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
