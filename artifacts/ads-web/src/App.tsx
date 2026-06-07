import React, { useCallback, useEffect, useState } from "react";

const API = "/api/ads-portal";

type Advertiser = {
  id: number;
  email: string;
  company_name: string;
  balance_inr?: string;
};

type Campaign = {
  id: number;
  name: string;
  status: string;
  daily_budget_inr: string;
  total_budget_inr: string;
  spent_inr: string;
};

type Stats = {
  impressions: string;
  completions: string;
  skips: string;
  creatives: number;
};

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem("videh_ads_token");
  const res = await fetch(`${API}${path}`, {
    ...opts,
    credentials: "include",
    headers: {
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  return res.json() as Promise<T>;
}

export default function App() {
  const [screen, setScreen] = useState<"auth" | "dash">("auth");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [newCampaign, setNewCampaign] = useState("");
  const [creativeTitle, setCreativeTitle] = useState("");
  const [creativeUrl, setCreativeUrl] = useState("");
  const [creativeType, setCreativeType] = useState<"non_skippable" | "skippable">("non_skippable");
  const [creativePlacement, setCreativePlacement] = useState("pre_roll");
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);

  const loadDash = useCallback(async () => {
    const me = await api<{ success: boolean; advertiser?: Advertiser }>("/me");
    if (!me.success || !me.advertiser) {
      setScreen("auth");
      return;
    }
    setAdvertiser(me.advertiser as Advertiser);
    const [c, s] = await Promise.all([
      api<{ success: boolean; campaigns: Campaign[] }>("/campaigns"),
      api<{ success: boolean; stats: Stats }>("/stats"),
    ]);
    if (c.success) setCampaigns(c.campaigns);
    if (s.success) setStats(s.stats);
    setScreen("dash");
  }, []);

  useEffect(() => {
    void loadDash();
  }, [loadDash]);

  const handleAuth = async () => {
    setError("");
    const path = authMode === "login" ? "/login" : "/register";
    const body = authMode === "login"
      ? { email, password }
      : { email, password, companyName };
    const res = await api<{ success: boolean; message?: string; token?: string; advertiser?: Advertiser }>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.success) {
      setError(res.message ?? "Failed");
      return;
    }
    if (res.token) localStorage.setItem("videh_ads_token", res.token);
    setAdvertiser(res.advertiser ?? null);
    await loadDash();
  };

  const createCampaign = async () => {
    if (!newCampaign.trim()) return;
    await api("/campaigns", {
      method: "POST",
      body: JSON.stringify({ name: newCampaign.trim(), dailyBudgetInr: 500, totalBudgetInr: 5000 }),
    });
    setNewCampaign("");
    await loadDash();
  };

  const createCreative = async () => {
    if (!selectedCampaign || !creativeTitle.trim() || !creativeUrl.trim()) return;
    await api(`/campaigns/${selectedCampaign}/creatives`, {
      method: "POST",
      body: JSON.stringify({
        title: creativeTitle.trim(),
        videoUrl: creativeUrl.trim(),
        durationSeconds: creativeType === "skippable" ? 60 : 30,
        skipAfterSeconds: creativeType === "skippable" ? 5 : null,
        placement: creativePlacement,
        adType: creativeType,
      }),
    });
    setCreativeTitle("");
    setCreativeUrl("");
    await loadDash();
  };

  if (screen === "auth") {
    return (
      <div style={styles.authWrap}>
        <div style={styles.authCard}>
          <div style={styles.logoRow}>
            <div style={styles.logoMark}>V</div>
            <div>
              <h1 style={styles.h1}>Videh Ads</h1>
              <p style={styles.sub}>Run video ads on Videh — like Google Ads for creators</p>
            </div>
          </div>
          <div style={styles.tabRow}>
            <button type="button" style={authMode === "login" ? styles.tabActive : styles.tab} onClick={() => setAuthMode("login")}>Sign in</button>
            <button type="button" style={authMode === "register" ? styles.tabActive : styles.tab} onClick={() => setAuthMode("register")}>Create account</button>
          </div>
          {authMode === "register" ? (
            <input style={styles.input} placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          ) : null}
          <input style={styles.input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={styles.input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error ? <p style={styles.err}>{error}</p> : null}
          <button type="button" style={styles.primaryBtn} onClick={() => void handleAuth()}>
            {authMode === "login" ? "Sign in" : "Register"}
          </button>
          <p style={styles.footnote}>
            Pre-roll: 30s non-skippable + 60s skippable · Mid-roll: 30s non-skippable every 8 min
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.logoRow}>
          <div style={styles.logoMark}>V</div>
          <strong>Videh Ads</strong>
        </div>
        <div style={styles.headerRight}>
          <span>{advertiser?.company_name}</span>
          <button type="button" style={styles.ghostBtn} onClick={() => { localStorage.removeItem("videh_ads_token"); setScreen("auth"); }}>Sign out</button>
        </div>
      </header>

      <main style={styles.main}>
        <section style={styles.hero}>
          <h2 style={{ margin: 0 }}>Campaigns</h2>
          <p style={styles.sub}>Your ads run before and during Videh videos — YouTube-style.</p>
        </section>

        <div style={styles.statGrid}>
          <StatCard label="Impressions" value={stats?.impressions ?? "0"} />
          <StatCard label="Completed views" value={stats?.completions ?? "0"} />
          <StatCard label="Skips" value={stats?.skips ?? "0"} />
          <StatCard label="Active creatives" value={String(stats?.creatives ?? 0)} />
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>New campaign</h3>
          <div style={styles.row}>
            <input style={{ ...styles.input, flex: 1 }} placeholder="Campaign name" value={newCampaign} onChange={(e) => setNewCampaign(e.target.value)} />
            <button type="button" style={styles.primaryBtn} onClick={() => void createCampaign()}>Create</button>
          </div>
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Your campaigns</h3>
          {campaigns.length === 0 ? <p style={styles.sub}>No campaigns yet.</p> : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Daily budget</th>
                  <th style={styles.th}>Spent</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} onClick={() => setSelectedCampaign(c.id)} style={{ cursor: "pointer", background: selectedCampaign === c.id ? "#e8f5f0" : undefined }}>
                    <td style={styles.td}>{c.name}</td>
                    <td style={styles.td}>{c.status}</td>
                    <td style={styles.td}>₹{c.daily_budget_inr}</td>
                    <td style={styles.td}>₹{c.spent_inr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={styles.panel}>
          <h3 style={styles.panelTitle}>Add ad creative</h3>
          <p style={styles.sub}>Upload a video URL. Pre-roll non-skippable = 30s · Skippable = up to 60s (skip after 5s).</p>
          <select style={styles.input} value={selectedCampaign ?? ""} onChange={(e) => setSelectedCampaign(Number(e.target.value) || null)}>
            <option value="">Select campaign</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input style={styles.input} placeholder="Ad title" value={creativeTitle} onChange={(e) => setCreativeTitle(e.target.value)} />
          <input style={styles.input} placeholder="Video URL (MP4)" value={creativeUrl} onChange={(e) => setCreativeUrl(e.target.value)} />
          <div style={styles.row}>
            <select style={styles.input} value={creativePlacement} onChange={(e) => setCreativePlacement(e.target.value)}>
              <option value="pre_roll">Pre-roll (before video)</option>
              <option value="mid_roll">Mid-roll (during video)</option>
              <option value="any">Any placement</option>
            </select>
            <select style={styles.input} value={creativeType} onChange={(e) => setCreativeType(e.target.value as "non_skippable" | "skippable")}>
              <option value="non_skippable">Non-skippable (30s)</option>
              <option value="skippable">Skippable (60s)</option>
            </select>
          </div>
          <button type="button" style={styles.primaryBtn} onClick={() => void createCreative()}>Publish ad</button>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  authWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "linear-gradient(135deg,#e8f5f0,#f8fafb)" },
  authCard: { width: "100%", maxWidth: 420, background: "#fff", borderRadius: 12, padding: 28, boxShadow: "0 8px 32px rgba(0,0,0,0.08)" },
  logoRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 },
  logoMark: { width: 40, height: 40, borderRadius: 8, background: "#00A884", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 },
  h1: { margin: 0, fontSize: 22 },
  sub: { margin: "4px 0 0", color: "#5f6368", fontSize: 14 },
  tabRow: { display: "flex", gap: 8, marginBottom: 16 },
  tab: { flex: 1, padding: "10px 0", border: "1px solid #dadce0", background: "#fff", borderRadius: 8, cursor: "pointer" },
  tabActive: { flex: 1, padding: "10px 0", border: "1px solid #00A884", background: "#e8f5f0", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  input: { width: "100%", padding: "12px 14px", marginBottom: 10, borderRadius: 8, border: "1px solid #dadce0", fontSize: 14 },
  primaryBtn: { width: "100%", padding: "12px 16px", background: "#00A884", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 },
  ghostBtn: { padding: "8px 14px", background: "transparent", border: "1px solid #dadce0", borderRadius: 8, cursor: "pointer" },
  err: { color: "#d93025", fontSize: 13 },
  footnote: { marginTop: 16, fontSize: 12, color: "#80868b", lineHeight: 1.5 },
  shell: { minHeight: "100vh" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", background: "#fff", borderBottom: "1px solid #e8eaed" },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  main: { maxWidth: 960, margin: "0 auto", padding: "24px 20px 48px" },
  hero: { marginBottom: 20 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 },
  statCard: { background: "#fff", borderRadius: 10, padding: 16, border: "1px solid #e8eaed" },
  statLabel: { fontSize: 12, color: "#5f6368" },
  statValue: { fontSize: 24, fontWeight: 700, marginTop: 4 },
  panel: { background: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, border: "1px solid #e8eaed" },
  panelTitle: { margin: "0 0 12px", fontSize: 16 },
  row: { display: "flex", gap: 10, alignItems: "center" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #e8eaed", color: "#5f6368", fontWeight: 500 },
  td: { padding: "10px 6px", borderBottom: "1px solid #f1f3f4" },
};
