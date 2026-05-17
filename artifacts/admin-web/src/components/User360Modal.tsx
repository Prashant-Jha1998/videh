import { useCallback, useEffect, useState } from "react";
import { adminApi, fmtDate, priorityBadge } from "../adminApi";

type Props = {
  userId: number;
  onClose: () => void;
  onErr: (msg: string) => void;
};

export function User360Modal({ userId, onClose, onErr }: Props) {
  const [data, setData] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminApi<any>(`/admin/users/${userId}/360`);
      setData(d);
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Failed to load user");
    } finally {
      setLoading(false);
    }
  }, [userId, onErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const moderate = async (action: string) => {
    if (reason.trim().length < 5) {
      onErr("Reason must be at least 5 characters");
      return;
    }
    try {
      await adminApi(`/admin/users/${userId}/moderate`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      });
      setReason("");
      await load();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Moderation failed");
    }
  };

  if (loading && !data) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <p className="muted">Loading user 360…</p>
        </div>
      </div>
    );
  }

  const u = data?.user;
  const risk = data?.risk;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card user360-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>User 360 — #{userId}</h3>
            <p className="muted">
              {u?.name ?? "—"} · {u?.phone}
            </p>
          </div>
          <button type="button" className="btn btn-ghost modal-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="user360-grid">
          <div className="card stat-inline">
            <b>Risk score</b>
            <span className={priorityBadge(risk?.score ?? 0)}>{risk?.score ?? 0}/100 ({risk?.tier})</span>
          </div>
          <div className="card stat-inline">
            <b>Open reports</b>
            <span>{data?.openReports ?? 0}</span>
          </div>
          <div className="card stat-inline">
            <b>Suggested action</b>
            <span className="badge-high">{data?.suggestedAction ?? "none"}</span>
          </div>
          <div className="card stat-inline">
            <b>Strikes</b>
            <span>{data?.moderation?.strike_count ?? 0}</span>
          </div>
        </div>

        <div className="field">
          <label>Admin action reason</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Document why you are taking action…" />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <button type="button" className="btn" style={{ width: "auto" }} onClick={() => void moderate("warn")}>
            Warn
          </button>
          <button type="button" className="btn" style={{ width: "auto" }} onClick={() => void moderate("suspend_24h")}>
            Suspend 24h
          </button>
          <button type="button" className="btn" style={{ width: "auto" }} onClick={() => void moderate("suspend_7d")}>
            Suspend 7d
          </button>
          <button type="button" className="btn btn-danger" style={{ width: "auto" }} onClick={() => void moderate("permanent_ban")}>
            Permanent ban
          </button>
        </div>

        <h4>Recent messages (abuse review)</h4>
        <div className="card" style={{ overflowX: "auto", maxHeight: 200 }}>
          <table>
            <thead>
              <tr>
                <th>Chat</th>
                <th>Type</th>
                <th>Preview</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentMessages ?? []).map((m: any) => (
                <tr key={m.id}>
                  <td>{m.is_group ? m.group_name : `DM #${m.chat_id}`}</td>
                  <td>{m.type}</td>
                  <td className="muted" style={{ maxWidth: 280 }}>
                    {(m.content ?? "").slice(0, 120)}
                  </td>
                  <td>{fmtDate(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h4>Reports against user</h4>
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Reporter</th>
                <th>Reason</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentReports ?? []).map((r: any) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.reporter_name ?? "—"}</td>
                  <td>{r.reason}</td>
                  <td>{r.status}</td>
                  <td>{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
