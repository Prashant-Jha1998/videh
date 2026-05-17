import { useCallback, useEffect, useState } from "react";
import { adminApi, fmtDate } from "../adminApi";

type Props = { onErr: (msg: string) => void };

export function AuditTab({ onErr }: Props) {
  const [audit, setAudit] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [incTitle, setIncTitle] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, i] = await Promise.all([
        adminApi<{ audit: any[] }>("/admin/audit-log?limit=120"),
        adminApi<{ incidents: any[] }>("/admin/incidents"),
      ]);
      setAudit(a.audit);
      setIncidents(i.incidents);
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Audit load failed");
    }
  }, [onErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const createIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (incTitle.trim().length < 3) return;
    try {
      await adminApi("/admin/incidents", {
        method: "POST",
        body: JSON.stringify({ title: incTitle, severity: "high" }),
      });
      setIncTitle("");
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Incident create failed");
    }
  };

  const resolveIncident = async (id: number) => {
    try {
      await adminApi(`/admin/incidents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved" }),
      });
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Incident update failed");
    }
  };

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Audit & incidents</h2>
      <p className="muted">Immutable admin action log for governance and incident response.</p>

      <form className="card" onSubmit={createIncident} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label>New incident title</label>
          <input value={incTitle} onChange={(e) => setIncTitle(e.target.value)} placeholder="e.g. OTP provider outage" />
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: "auto" }}>
          Open incident
        </button>
      </form>

      <div className="card" style={{ overflowX: "auto", marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Started</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id}>
                <td>{i.id}</td>
                <td>{i.title}</td>
                <td>{i.severity}</td>
                <td>{i.status}</td>
                <td>{fmtDate(i.started_at)}</td>
                <td>
                  {i.status !== "resolved" ? (
                    <button type="button" className="btn" style={{ width: "auto", padding: "4px 8px" }} onClick={() => void resolveIncident(i.id)}>
                      Resolve
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Entity</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}>
                <td>{fmtDate(a.created_at)}</td>
                <td>{a.admin_email}</td>
                <td>{a.action}</td>
                <td>
                  {a.entity_type} #{a.entity_id ?? "—"}
                </td>
                <td className="muted">{a.ip_address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
