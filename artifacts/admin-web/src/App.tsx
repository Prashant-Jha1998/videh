import { useCallback, useEffect, useState } from "react";

type Tab = "overview" | "users" | "chats" | "group-create" | "suspensions" | "boosts" | "scheduled" | "broadcasts" | "calls";

type Stats = {
  users: number;
  chats: number;
  messages_24h: number;
  messages_total: number;
  calls_7d: number;
  calls_total: number;
  sos_contacts: number;
  scheduled_pending: number;
  broadcast_lists: number;
  statuses_active: number;
  status_boosts_active: number;
  status_boosts_pending: number;
  status_boost_revenue_inr: number;
  web_sessions_active: number;
};

type StatusBoostRow = {
  id: number;
  owner_name?: string;
  content?: string;
  type?: "text" | "image" | "video";
  media_url?: string;
  target_city?: string;
  target_state?: string;
  target_radius_km?: number;
  duration_days?: number;
  estimated_reach?: number;
  amount_inr?: number;
  payment_provider?: string;
  payment_reference?: string;
  created_at?: string;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error((data as { message?: string }).message ?? res.statusText);
  }
  return data as T;
}

type AdminConfig = {
  success?: boolean;
  twoFactorConfigured?: boolean;
  preauthPending?: boolean;
};

export default function App() {
  const [tab, setTab] = useState<Tab>("overview");
  const [ready, setReady] = useState<"loading" | "guest" | "need2fa" | "authed">("loading");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [totpErr, setTotpErr] = useState<string | null>(null);
  const [serverConfig, setServerConfig] = useState<AdminConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [users, setUsers] = useState<unknown[]>([]);
  const [chats, setChats] = useState<unknown[]>([]);
  const [scheduled, setScheduled] = useState<unknown[]>([]);
  const [broadcasts, setBroadcasts] = useState<unknown[]>([]);
  const [calls, setCalls] = useState<unknown[]>([]);
  const [suspensions, setSuspensions] = useState<unknown[]>([]);
  const [boosts, setBoosts] = useState<StatusBoostRow[]>([]);
  const [previewBoost, setPreviewBoost] = useState<StatusBoostRow | null>(null);
  const [rejectBoost, setRejectBoost] = useState<StatusBoostRow | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupCreatorPhone, setGroupCreatorPhone] = useState("");
  const [groupMembersRaw, setGroupMembersRaw] = useState("");
  const [groupAdminsRaw, setGroupAdminsRaw] = useState("");
  const [groupCreateResult, setGroupCreateResult] = useState<string | null>(null);

  const refreshAuth = useCallback(async () => {
    try {
      await api<{ success: boolean }>("/admin/me");
      setReady("authed");
      return;
    } catch {
      /* not logged in */
    }
    try {
      const cfg = await api<AdminConfig>("/admin/config");
      setServerConfig(cfg);
      if (cfg.preauthPending) {
        setReady("need2fa");
        return;
      }
    } catch {
      setServerConfig(null);
    }
    setReady("guest");
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const loadStats = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<{ success: boolean; stats: Stats }>("/admin/stats");
      setStats(d.stats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load stats");
    }
  }, []);

  useEffect(() => {
    if (ready !== "authed") return;
    if (tab === "overview") void loadStats();
  }, [ready, tab, loadStats]);

  const loadUsers = useCallback(async () => {
    setErr(null);
    try {
      const q = userSearch.trim() ? `?search=${encodeURIComponent(userSearch.trim())}` : "";
      const d = await api<{ users: unknown[] }>(`/admin/users${q}`);
      setUsers(d.users);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load users");
    }
  }, [userSearch]);

  useEffect(() => {
    if (ready !== "authed" || tab !== "users") return;
    void loadUsers();
  }, [ready, tab, loadUsers]);

  const loadChats = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<{ chats: unknown[] }>("/admin/chats");
      setChats(d.chats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load chats");
    }
  }, []);

  useEffect(() => {
    if (ready !== "authed" || tab !== "chats") return;
    void loadChats();
  }, [ready, tab, loadChats]);

  const loadScheduled = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<{ scheduled: unknown[] }>("/admin/scheduled");
      setScheduled(d.scheduled);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load scheduled");
    }
  }, []);

  useEffect(() => {
    if (ready !== "authed" || tab !== "scheduled") return;
    void loadScheduled();
  }, [ready, tab, loadScheduled]);

  const loadBroadcasts = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<{ broadcasts: unknown[] }>("/admin/broadcasts");
      setBroadcasts(d.broadcasts);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load broadcasts");
    }
  }, []);

  useEffect(() => {
    if (ready !== "authed" || tab !== "broadcasts") return;
    void loadBroadcasts();
  }, [ready, tab, loadBroadcasts]);

  const loadCalls = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<{ calls: unknown[] }>("/admin/calls");
      setCalls(d.calls);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load calls");
    }
  }, []);

  useEffect(() => {
    if (ready !== "authed" || tab !== "calls") return;
    void loadCalls();
  }, [ready, tab, loadCalls]);

  const loadBoosts = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<{ boosts: StatusBoostRow[] }>("/admin/status-boosts?status=pending_verification");
      setBoosts(d.boosts);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load boosts");
    }
  }, []);

  useEffect(() => {
    if (ready !== "authed" || tab !== "boosts") return;
    void loadBoosts();
  }, [ready, tab, loadBoosts]);

  const reviewBoost = useCallback(async (boostId: number, action: "approve" | "reject") => {
    const note = window.prompt(action === "approve" ? "Approval note (optional)" : "Reject reason") ?? "";
    if (action === "reject" && !note.trim()) {
      setErr("Reject reason is required.");
      return;
    }
    try {
      await api(`/admin/status-boosts/${boostId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      await loadBoosts();
      if (tab === "overview") await loadStats();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Failed to ${action} boost`);
    }
  }, [loadBoosts, loadStats, tab]);

  const submitRejectBoost = useCallback(async () => {
    if (!rejectBoost) return;
    const note = rejectNote.trim();
    if (!note) {
      setErr("Reject reason is required.");
      return;
    }
    try {
      await api(`/admin/status-boosts/${rejectBoost.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setRejectBoost(null);
      setRejectNote("");
      await loadBoosts();
      if (tab === "overview") await loadStats();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to reject boost");
    }
  }, [loadBoosts, loadStats, rejectBoost, rejectNote, tab]);

  const loadSuspensions = useCallback(async () => {
    setErr(null);
    try {
      const d = await api<{ suspensions: unknown[] }>("/admin/suspensions");
      setSuspensions(d.suspensions);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load suspensions");
    }
  }, []);

  useEffect(() => {
    if (ready !== "authed" || tab !== "suspensions") return;
    void loadSuspensions();
  }, [ready, tab, loadSuspensions]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; needTwoFactor?: boolean; message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? res.statusText);
      }
      setLoginPass("");
      if (data.needTwoFactor) {
        setReady("need2fa");
        setTotpCode("");
        setTotpErr(null);
        return;
      }
      await refreshAuth();
    } catch (e) {
      setLoginErr(e instanceof Error ? e.message : "Login failed");
    }
  };

  const onTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpErr(null);
    try {
      await api("/admin/login/totp", {
        method: "POST",
        body: JSON.stringify({ code: totpCode }),
      });
      setTotpCode("");
      await refreshAuth();
    } catch (e) {
      setTotpErr(e instanceof Error ? e.message : "Verification failed");
    }
  };

  const onCancel2fa = async () => {
    try {
      await api("/admin/login/cancel", { method: "POST" });
    } catch {
      /* ignore */
    }
    setTotpCode("");
    setReady("guest");
  };

  const onLogout = async () => {
    try {
      await api("/admin/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    setStats(null);
    await refreshAuth();
  };

  const onCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setGroupCreateResult(null);
    try {
      const d = await api<{
        success: boolean;
        chatId: number;
        registeredAddedMembers: number;
        notOnVidehPhones: string[];
        adminsSet: number;
      }>("/admin/groups/create", {
        method: "POST",
        body: JSON.stringify({
          groupName,
          creatorPhone: groupCreatorPhone,
          memberPhones: groupMembersRaw,
          adminPhones: groupAdminsRaw,
        }),
      });
      const missingCount = d.notOnVidehPhones?.length ?? 0;
      setGroupCreateResult(
        `Group #${d.chatId} created. Added ${d.registeredAddedMembers} registered users, ${d.adminsSet} admins set. Missing on Videh: ${missingCount}.`,
      );
      setGroupName("");
      setGroupMembersRaw("");
      setGroupAdminsRaw("");
      void loadChats();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create group");
    }
  };

  const revokeSuspension = async (userId: number) => {
    setErr(null);
    try {
      await api(`/admin/suspensions/${userId}/revoke`, { method: "POST" });
      setSuspensions((prev) => prev.filter((x: any) => Number(x.user_id) !== userId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to revoke suspension");
    }
  };

  if (ready === "loading") {
    return (
      <div className="login-wrap">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (ready === "need2fa") {
    return (
      <div className="login-wrap">
        <h2>Two-factor authentication</h2>
        <p className="muted">Open your authenticator app and enter the 6-digit code for Videh Admin.</p>
        <form onSubmit={onTotpSubmit}>
          <div className="field">
            <label htmlFor="totp">Authenticator code</label>
            <input
              id="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              maxLength={12}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ""))}
              required
            />
          </div>
          {totpErr ? <div className="err">{totpErr}</div> : null}
          <button type="submit" className="btn btn-primary">
            Verify & continue
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void onCancel2fa()}>
            Back to email login
          </button>
        </form>
      </div>
    );
  }

  if (ready === "guest") {
    return (
      <div className="login-wrap">
        <h2>Videh Admin</h2>
        <p className="muted">
          Sign in with email and password, then enter a code from your authenticator app (TOTP). Server must set
          ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_SESSION_SECRET, and ADMIN_TOTP_SECRET (Base32).
        </p>
        {serverConfig?.twoFactorConfigured === false ? (
          <p className="err" style={{ marginBottom: 12 }}>
            2FA is not configured on this server (missing ADMIN_TOTP_SECRET). Login cannot complete until it is set.
          </p>
        ) : null}
        <form onSubmit={onLogin}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              required
            />
          </div>
          {loginErr ? <div className="err">{loginErr}</div> : null}
          <button type="submit" className="btn btn-primary">
            Sign in
          </button>
        </form>
      </div>
    );
  }

  const nav = (id: Tab, label: string) => (
    <button type="button" key={id} className={`nav-btn ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
      {label}
    </button>
  );

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Videh Admin</h1>
        {nav("overview", "Overview")}
        {nav("users", "Users")}
        {nav("chats", "Chats")}
        {nav("group-create", "Create Group")}
        {nav("suspensions", "Suspensions")}
        {nav("boosts", "Story Boosts")}
        {nav("scheduled", "Scheduled")}
        {nav("broadcasts", "Broadcasts")}
        {nav("calls", "Calls")}
        <button type="button" className="nav-btn" style={{ marginTop: 24 }} onClick={() => void onLogout()}>
          Log out
        </button>
      </aside>
      <main>
        {err ? <div className="card err">{err}</div> : null}

        {tab === "overview" && (
          <>
            <h2 style={{ marginTop: 0 }}>Overview</h2>
            <p className="muted">Live counts from your Videh database.</p>
            {stats ? (
              <div className="grid-stats">
                <div className="stat">
                  <b>{stats.users}</b>
                  <span>Users</span>
                </div>
                <div className="stat">
                  <b>{stats.chats}</b>
                  <span>Chats</span>
                </div>
                <div className="stat">
                  <b>{stats.messages_24h}</b>
                  <span>Messages (24h)</span>
                </div>
                <div className="stat">
                  <b>{stats.messages_total}</b>
                  <span>Messages (total)</span>
                </div>
                <div className="stat">
                  <b>{stats.calls_7d}</b>
                  <span>Calls (7d)</span>
                </div>
                <div className="stat">
                  <b>{stats.calls_total}</b>
                  <span>Calls (total)</span>
                </div>
                <div className="stat">
                  <b>{stats.sos_contacts}</b>
                  <span>SOS contacts</span>
                </div>
                <div className="stat">
                  <b>{stats.scheduled_pending}</b>
                  <span>Scheduled pending</span>
                </div>
                <div className="stat">
                  <b>{stats.broadcast_lists}</b>
                  <span>Broadcast lists</span>
                </div>
                <div className="stat">
                  <b>{stats.statuses_active}</b>
                  <span>Active statuses</span>
                </div>
                <div className="stat">
                  <b>{stats.status_boosts_active}</b>
                  <span>Active boosts</span>
                </div>
                <div className="stat">
                  <b>{stats.status_boosts_pending}</b>
                  <span>Pending boosts</span>
                </div>
                <div className="stat">
                  <b>₹{stats.status_boost_revenue_inr}</b>
                  <span>Boost revenue</span>
                </div>
                <div className="stat">
                  <b>{stats.web_sessions_active}</b>
                  <span>Web sessions</span>
                </div>
              </div>
            ) : (
              <p className="muted">Loading stats…</p>
            )}
            <div className="card" style={{ marginTop: 20 }}>
              <p className="muted" style={{ margin: 0 }}>
                API health: <a href="/api/healthz">/api/healthz</a> · User app: <a href="/videh-web/">/videh-web/</a>
              </p>
            </div>
          </>
        )}

        {tab === "users" && (
          <>
            <h2 style={{ marginTop: 0 }}>Users</h2>
            <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                placeholder="Search phone or name…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 160,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
              <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={() => void loadUsers()}>
                Search
              </button>
            </div>
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Phone</th>
                    <th>Name</th>
                    <th>Online</th>
                    <th>Push</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td>{u.phone}</td>
                      <td>{u.name ?? "—"}</td>
                      <td>{u.is_online ? "yes" : "no"}</td>
                      <td>{u.has_push ? "yes" : "no"}</td>
                      <td>{u.created_at ? String(u.created_at).slice(0, 16) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "chats" && (
          <>
            <h2 style={{ marginTop: 0 }}>Chats</h2>
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Group</th>
                    <th>Name / policy</th>
                    <th>Members</th>
                    <th>Messages</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {chats.map((c: any) => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      <td>{c.is_group ? "yes" : "DM"}</td>
                      <td>
                        {c.is_group ? (
                          <>
                            {c.group_name ?? "—"}
                            <span className="muted"> · {c.group_messaging_policy}</span>
                          </>
                        ) : (
                          <span className="muted">direct</span>
                        )}
                      </td>
                      <td>{c.member_count}</td>
                      <td>{c.message_count}</td>
                      <td>{c.created_at ? String(c.created_at).slice(0, 16) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "scheduled" && (
          <>
            <h2 style={{ marginTop: 0 }}>Scheduled messages</h2>
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Chat</th>
                    <th>Sender</th>
                    <th>When</th>
                    <th>Sent</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduled.map((s: any) => (
                    <tr key={s.id}>
                      <td>{s.id}</td>
                      <td>{s.chat_id}</td>
                      <td>{s.sender_name}</td>
                      <td>{s.scheduled_at ? String(s.scheduled_at).slice(0, 16) : "—"}</td>
                      <td>{s.sent ? "yes" : "no"}</td>
                      <td style={{ maxWidth: 220 }} className="muted">
                        {(s.content ?? "").slice(0, 80)}
                        {(s.content ?? "").length > 80 ? "…" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "group-create" && (
          <>
            <h2 style={{ marginTop: 0 }}>Create Group (Admin)</h2>
            <p className="muted">
              Up to 10,000 phone numbers. Only users already registered on Videh are added. Group will appear in their chat feed.
            </p>
            <form className="card group-form" onSubmit={onCreateGroup}>
              <div className="field">
                <label htmlFor="grpName">Group name</label>
                <input
                  id="grpName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Bihar Volunteers 2026"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="grpCreatorPhone">Creator phone (must be on Videh)</label>
                <input
                  id="grpCreatorPhone"
                  value={groupCreatorPhone}
                  onChange={(e) => setGroupCreatorPhone(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="grpMembers">Member phones (comma/newline separated, up to 10,000)</label>
                <textarea
                  id="grpMembers"
                  value={groupMembersRaw}
                  onChange={(e) => setGroupMembersRaw(e.target.value)}
                  placeholder="+919999999999&#10;+918888888888"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="grpAdmins">Admin phones (optional, must also be in members)</label>
                <textarea
                  id="grpAdmins"
                  value={groupAdminsRaw}
                  onChange={(e) => setGroupAdminsRaw(e.target.value)}
                  placeholder="+919999999999"
                />
              </div>
              <button type="submit" className="btn btn-primary">
                Create group
              </button>
              {groupCreateResult ? <p className="ok">{groupCreateResult}</p> : null}
            </form>
          </>
        )}

        {tab === "suspensions" && (
          <>
            <h2 style={{ marginTop: 0 }}>Suspended Accounts</h2>
            <p className="muted">Admin can revoke temporary or permanent suspension.</p>
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Phone</th>
                    <th>Name</th>
                    <th>Strikes</th>
                    <th>Status</th>
                    <th>Until</th>
                    <th>Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {suspensions.map((s: any) => {
                    const isPermanent = Boolean(s.permanently_suspended);
                    return (
                      <tr key={s.user_id}>
                        <td>{s.user_id}</td>
                        <td>{s.phone ?? "—"}</td>
                        <td>{s.name ?? "—"}</td>
                        <td>{s.strike_count ?? 0}</td>
                        <td>{isPermanent ? "Permanent" : "Temporary"}</td>
                        <td>{isPermanent ? "—" : (s.suspended_until ? String(s.suspended_until).slice(0, 16) : "—")}</td>
                        <td style={{ maxWidth: 220 }} className="muted">
                          {s.last_reason ?? "—"}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ width: "auto", padding: "6px 10px" }}
                            onClick={() => void revokeSuspension(Number(s.user_id))}
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {suspensions.length === 0 ? <p className="muted" style={{ marginTop: 12 }}>No active suspensions.</p> : null}
            </div>
          </>
        )}

        {tab === "boosts" && (
          <>
            <h2 style={{ marginTop: 0 }}>Story Boost Verification</h2>
            <p className="muted">Paid story boosts stay pending until admin approves. Approval starts the paid boost duration.</p>
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Owner</th>
                    <th>Story</th>
                    <th>Preview</th>
                    <th>Target</th>
                    <th>Days</th>
                    <th>Reach</th>
                    <th>Paid</th>
                    <th>Payment</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {boosts.map((b: StatusBoostRow) => (
                    <tr key={b.id}>
                      <td>{b.id}</td>
                      <td>{b.owner_name ?? "—"}</td>
                      <td style={{ maxWidth: 220 }}>
                        <b>{b.type}</b>
                        <div className="muted">{(b.content ?? "").slice(0, 80)}{(b.content ?? "").length > 80 ? "…" : ""}</div>
                      </td>
                      <td>
                        {b.media_url ? (
                          <button type="button" className="story-preview-btn" onClick={() => setPreviewBoost(b)}>
                            {b.type === "video" ? (
                              <video src={b.media_url} muted preload="metadata" className="story-thumb" />
                            ) : (
                              <img src={b.media_url} alt="Story preview" className="story-thumb" />
                            )}
                            <span>{b.type === "video" ? "Play video" : "View image"}</span>
                          </button>
                        ) : (
                          <button type="button" className="btn" style={{ width: "auto", padding: "6px 10px" }} onClick={() => setPreviewBoost(b)}>
                            View text
                          </button>
                        )}
                      </td>
                      <td>
                        {b.target_city ?? "Any city"}, {b.target_state ?? "Any state"}
                        <div className="muted">{b.target_radius_km} km radius</div>
                      </td>
                      <td>{b.duration_days}</td>
                      <td>{b.estimated_reach}</td>
                      <td>₹{b.amount_inr}</td>
                      <td>
                        {b.payment_provider}
                        <div className="muted">{b.payment_reference ?? "—"}</div>
                      </td>
                      <td>{b.created_at ? String(b.created_at).slice(0, 16) : "—"}</td>
                      <td style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="btn btn-primary" style={{ width: "auto", padding: "6px 10px" }} onClick={() => void reviewBoost(Number(b.id), "approve")}>
                          Verify
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ width: "auto", padding: "6px 10px" }}
                          onClick={() => {
                            setRejectBoost(b);
                            setRejectNote("");
                          }}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {boosts.length === 0 ? <p className="muted" style={{ marginTop: 12 }}>No pending boost requests.</p> : null}
            </div>
          </>
        )}

        {tab === "broadcasts" && (
          <>
            <h2 style={{ marginTop: 0 }}>Broadcast lists</h2>
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Creator</th>
                    <th>Recipients</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {broadcasts.map((b: any) => (
                    <tr key={b.id}>
                      <td>{b.id}</td>
                      <td>{b.name}</td>
                      <td>{b.creator_name}</td>
                      <td>{b.recipient_count}</td>
                      <td>{b.created_at ? String(b.created_at).slice(0, 16) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "calls" && (
          <>
            <h2 style={{ marginTop: 0 }}>Recent calls</h2>
            <div className="card" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Caller</th>
                    <th>Callee</th>
                    <th>Duration</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c: any) => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      <td>{c.type}</td>
                      <td>{c.status}</td>
                      <td>{c.caller_name}</td>
                      <td>{c.callee_name}</td>
                      <td>{c.duration_seconds}s</td>
                      <td>{c.created_at ? String(c.created_at).slice(0, 16) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {previewBoost ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card story-preview-modal">
              <div className="modal-head">
                <div>
                  <h3>Story preview</h3>
                  <p className="muted">{previewBoost.owner_name ?? "Unknown owner"} · {previewBoost.type ?? "story"}</p>
                </div>
                <button type="button" className="btn btn-ghost modal-close" onClick={() => setPreviewBoost(null)}>
                  Close
                </button>
              </div>
              {previewBoost.media_url ? (
                previewBoost.type === "video" ? (
                  <video src={previewBoost.media_url} controls autoPlay className="story-preview-media" />
                ) : (
                  <img src={previewBoost.media_url} alt="Story preview" className="story-preview-media" />
                )
              ) : (
                <div className="story-text-preview">{previewBoost.content || "No text content"}</div>
              )}
              {previewBoost.content ? <p className="muted">{previewBoost.content}</p> : null}
            </div>
          </div>
        ) : null}

        {rejectBoost ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card">
              <div className="modal-head">
                <div>
                  <h3>Reject story boost</h3>
                  <p className="muted">Write the reason. This note will be shown to the story owner.</p>
                </div>
                <button type="button" className="btn btn-ghost modal-close" onClick={() => setRejectBoost(null)}>
                  Close
                </button>
              </div>
              <div className="field">
                <label htmlFor="reject-note">Admin note</label>
                <textarea
                  id="reject-note"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Example: Story contains unclear/invalid promotional content. Please upload a corrected story and try again."
                  required
                />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={() => setRejectBoost(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" style={{ width: "auto" }} onClick={() => void submitRejectBoost()}>
                  Reject and send note
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
