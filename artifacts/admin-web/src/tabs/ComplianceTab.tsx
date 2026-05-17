import { useCallback, useEffect, useState } from "react";
import { adminApi, fmtDate } from "../adminApi";

type Props = { onErr: (msg: string) => void };

export function ComplianceTab({ onErr }: Props) {
  const [section, setSection] = useState<"grievance" | "legal" | "dsr">("grievance");
  const [grievances, setGrievances] = useState<any[]>([]);
  const [legal, setLegal] = useState<any[]>([]);
  const [dsr, setDsr] = useState<any[]>([]);

  const [gName, setGName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gPhone, setGPhone] = useState("");
  const [gDesc, setGDesc] = useState("");

  const [lAgency, setLAgency] = useState("");
  const [lScope, setLScope] = useState("");
  const [lIds, setLIds] = useState("");

  const [dUserId, setDUserId] = useState("");
  const [dPhone, setDPhone] = useState("");
  const [dType, setDType] = useState("export");

  const load = useCallback(async () => {
    try {
      const [g, l, d] = await Promise.all([
        adminApi<{ grievances: any[] }>("/admin/grievances?status=open"),
        adminApi<{ requests: any[] }>("/admin/legal-requests"),
        adminApi<{ requests: any[] }>("/admin/data-requests"),
      ]);
      setGrievances(g.grievances);
      setLegal(l.requests);
      setDsr(d.requests);
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Compliance load failed");
    }
  }, [onErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const createGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi("/admin/grievances", {
        method: "POST",
        body: JSON.stringify({
          complainantName: gName,
          email: gEmail,
          phone: gPhone,
          description: gDesc,
          category: "it_rules_grievance",
        }),
      });
      setGName("");
      setGEmail("");
      setGPhone("");
      setGDesc("");
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Create grievance failed");
    }
  };

  const ackGrievance = async (id: number) => {
    try {
      await adminApi(`/admin/grievances/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ firstResponse: true, status: "in_progress" }),
      });
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Ack failed");
    }
  };

  const resolveGrievance = async (id: number) => {
    const note = window.prompt("Resolution note") ?? "";
    if (note.length < 5) return;
    try {
      await adminApi(`/admin/grievances/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved", resolutionNote: note }),
      });
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Resolve failed");
    }
  };

  const createLegal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi("/admin/legal-requests", {
        method: "POST",
        body: JSON.stringify({
          agencyName: lAgency,
          scope: lScope,
          userIdentifiers: lIds.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean),
          requestType: "law_enforcement",
        }),
      });
      setLAgency("");
      setLScope("");
      setLIds("");
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Legal request failed");
    }
  };

  const createDsr = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi("/admin/data-requests", {
        method: "POST",
        body: JSON.stringify({
          userId: dUserId ? Number(dUserId) : undefined,
          subjectPhone: dPhone || undefined,
          requestType: dType,
        }),
      });
      setDUserId("");
      setDPhone("");
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "DSR create failed");
    }
  };

  const updateDsr = async (id: number, status: string) => {
    try {
      await adminApi(`/admin/data-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "DSR update failed");
    }
  };

  return (
    <>
      <h2 style={{ marginTop: 0 }}>India compliance</h2>
      <p className="muted">Grievance SLA: first response within 36 hours · DPDP data principal requests · Law enforcement log</p>

      <div className="subnav">
        <button type="button" className={section === "grievance" ? "nav-btn active" : "nav-btn"} onClick={() => setSection("grievance")}>
          Grievances
        </button>
        <button type="button" className={section === "legal" ? "nav-btn active" : "nav-btn"} onClick={() => setSection("legal")}>
          Legal requests
        </button>
        <button type="button" className={section === "dsr" ? "nav-btn active" : "nav-btn"} onClick={() => setSection("dsr")}>
          DPDP / data requests
        </button>
      </div>

      {section === "grievance" ? (
        <>
          <form className="card" onSubmit={createGrievance}>
            <h3>Log grievance (IT Rules)</h3>
            <div className="field">
              <label>Complainant name</label>
              <input value={gName} onChange={(e) => setGName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={gEmail} onChange={(e) => setGEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={gPhone} onChange={(e) => setGPhone(e.target.value)} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea value={gDesc} onChange={(e) => setGDesc(e.target.value)} required minLength={10} />
            </div>
            <button type="submit" className="btn btn-primary">
              Create ticket
            </button>
          </form>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Name</th>
                  <th>SLA ack</th>
                  <th>Overdue</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {grievances.map((g) => (
                  <tr key={g.id} className={g.ack_overdue ? "row-danger" : ""}>
                    <td>{g.ticket_number}</td>
                    <td>{g.complainant_name}</td>
                    <td>{fmtDate(g.sla_ack_due_at)}</td>
                    <td>{g.ack_overdue ? "YES" : "no"}</td>
                    <td>{g.status}</td>
                    <td>
                      <button type="button" className="btn" style={{ width: "auto", padding: "4px 8px" }} onClick={() => void ackGrievance(g.id)}>
                        Acknowledge
                      </button>
                      <button type="button" className="btn" style={{ width: "auto", padding: "4px 8px" }} onClick={() => void resolveGrievance(g.id)}>
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {section === "legal" ? (
        <>
          <form className="card" onSubmit={createLegal}>
            <h3>Law enforcement / legal request</h3>
            <div className="field">
              <label>Agency name</label>
              <input value={lAgency} onChange={(e) => setLAgency(e.target.value)} required />
            </div>
            <div className="field">
              <label>User identifiers (phones, one per line)</label>
              <textarea value={lIds} onChange={(e) => setLIds(e.target.value)} />
            </div>
            <div className="field">
              <label>Scope</label>
              <input value={lScope} onChange={(e) => setLScope(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary">
              Log request
            </button>
          </form>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Agency</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {legal.map((l) => (
                  <tr key={l.id}>
                    <td>{l.reference_number}</td>
                    <td>{l.agency_name}</td>
                    <td>{l.request_type}</td>
                    <td>{l.status}</td>
                    <td>{fmtDate(l.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {section === "dsr" ? (
        <>
          <form className="card" onSubmit={createDsr}>
            <h3>DPDP data principal request</h3>
            <div className="field">
              <label>User ID</label>
              <input value={dUserId} onChange={(e) => setDUserId(e.target.value)} />
            </div>
            <div className="field">
              <label>Or phone</label>
              <input value={dPhone} onChange={(e) => setDPhone(e.target.value)} />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={dType} onChange={(e) => setDType(e.target.value)}>
                <option value="export">Export</option>
                <option value="delete">Delete</option>
                <option value="correction">Correction</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary">
              Queue request
            </button>
          </form>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dsr.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.name ?? r.subject_phone ?? r.user_id}</td>
                    <td>{r.request_type}</td>
                    <td>{r.status}</td>
                    <td>{fmtDate(r.created_at)}</td>
                    <td>
                      <button type="button" className="btn" style={{ width: "auto", padding: "4px 8px" }} onClick={() => void updateDsr(r.id, "in_progress")}>
                        Verify
                      </button>
                      <button type="button" className="btn btn-primary" style={{ width: "auto", padding: "4px 8px" }} onClick={() => void updateDsr(r.id, "completed")}>
                        Complete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
