import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../adminApi";

type Props = { onErr: (msg: string) => void; canManage: boolean };

export function AdminsTab({ onErr, canManage }: Props) {
  const [admins, setAdmins] = useState<any[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("moderator");
  const [displayName, setDisplayName] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await adminApi<{ admins: any[]; roles: string[] }>("/admin/admins");
      setAdmins(d.admins);
      setRoles(d.roles);
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Failed to load admins");
    }
  }, [onErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi("/admin/admins", {
        method: "POST",
        body: JSON.stringify({ email, password, role, displayName }),
      });
      setEmail("");
      setPassword("");
      setDisplayName("");
      await load();
    } catch (err) {
      onErr(err instanceof Error ? err.message : "Create admin failed");
    }
  };

  if (!canManage) {
    return (
      <>
        <h2 style={{ marginTop: 0 }}>Admin users</h2>
        <p className="muted">Only super_admin can manage admin accounts.</p>
      </>
    );
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Admin users (RBAC)</h2>
      <p className="muted">Roles: super_admin, moderator, legal, read_only. Each admin needs their own TOTP secret in DB or shared env secret.</p>

      <form className="card" onSubmit={create}>
        <h3>Add admin</h3>
        <div className="field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </div>
        <div className="field">
          <label>Password (min 10)</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={10} />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary">
          Create admin
        </button>
      </form>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>Role</th>
              <th>Name</th>
              <th>2FA</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td>{a.email}</td>
                <td>{a.role}</td>
                <td>{a.display_name ?? "—"}</td>
                <td>{a.has_totp ? "yes" : "env"}</td>
                <td>{a.is_active ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
