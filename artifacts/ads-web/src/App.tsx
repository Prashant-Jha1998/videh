import React, { useCallback, useEffect, useState } from "react";
import { openAdsRazorpayCheckout } from "./lib/razorpayCheckout";

const API = "/api/ads-portal";

type Advertiser = { id: number; email: string; company_name: string; balance_inr?: string };
type Campaign = {
  id: number; name: string; status: string; objective?: string;
  bid_model?: string; bid_amount_inr?: string;
  daily_budget_inr: string; total_budget_inr: string; spent_inr: string;
};
type Stats = { impressions: string; completions: string; skips: string; clicks?: string; spent_inr?: string; creatives: number };
type Pricing = {
  feedCpmInr: number; feedCpcInr: number; appInstallCpiInr: number; videoCpvInr: number; minTopUpInr: number;
  feedAdEveryVideos: number;
  objectives: Array<{ id: string; label: string; bidModel: string; defaultBid: number }>;
};
type Nav = "overview" | "campaigns" | "ads" | "billing";
type WalletConfig = {
  razorpayConfigured: boolean;
  razorpayKeyId: string | null;
  minTopUpInr: number;
  isDemoAccount: boolean;
  paymentRequired: boolean;
};
type PaymentRow = {
  amount_inr: string;
  razorpay_payment_id: string;
  payment_method: string | null;
  status: string;
  created_at: string;
};

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem("videh_ads_token");
  const res = await fetch(`${API}${path}`, {
    ...opts,
    credentials: "include",
    headers: {
      ...(opts?.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  return res.json() as Promise<T>;
}

const OBJECTIVE_LABELS: Record<string, string> = {
  brand_awareness: "Brand awareness",
  shopping: "Shopping",
  app_promotion: "App promotion",
  video_views: "Video views",
};

const BID_LABELS: Record<string, string> = {
  cpm: "CPM (per 1,000 impressions)",
  cpc: "CPC (per click)",
  cpi: "CPI (per app install tap)",
  cpv: "CPV (per completed view)",
};

export default function App() {
  const [screen, setScreen] = useState<"auth" | "dash">("auth");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [nav, setNav] = useState<Nav>("overview");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);

  const [newCampaign, setNewCampaign] = useState("");
  const [objective, setObjective] = useState("brand_awareness");
  const [bidAmount, setBidAmount] = useState("120");
  const [dailyBudget, setDailyBudget] = useState("500");
  const [totalBudget, setTotalBudget] = useState("5000");

  const [adFormat, setAdFormat] = useState<"video" | "image" | "app_install" | "shopping">("shopping");
  const [creativeTitle, setCreativeTitle] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [playStoreUrl, setPlayStoreUrl] = useState("");
  const [appStoreUrl, setAppStoreUrl] = useState("");
  const [appName, setAppName] = useState("");
  const [placement, setPlacement] = useState("feed_instream");
  const [topUpAmount, setTopUpAmount] = useState("1000");
  const [walletConfig, setWalletConfig] = useState<WalletConfig | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paying, setPaying] = useState(false);

  const loadDash = useCallback(async () => {
    const me = await api<{ success: boolean; advertiser?: Advertiser }>("/me");
    if (!me.success || !me.advertiser) { setScreen("auth"); return; }
    setAdvertiser(me.advertiser);
    const [c, s, p, w, pay] = await Promise.all([
      api<{ success: boolean; campaigns: Campaign[] }>("/campaigns"),
      api<{ success: boolean; stats: Stats }>("/stats"),
      api<{ success: boolean; pricing: Pricing }>("/pricing"),
      api<{ success: boolean } & WalletConfig>("/wallet/config"),
      api<{ success: boolean; payments: PaymentRow[] }>("/wallet/payments"),
    ]);
    if (c.success) setCampaigns(c.campaigns);
    if (s.success) setStats(s.stats);
    if (p.success) setPricing(p.pricing);
    if (w.success) setWalletConfig(w);
    if (pay.success) setPayments(pay.payments ?? []);
    setScreen("dash");
  }, []);

  useEffect(() => { void loadDash(); }, [loadDash]);

  useEffect(() => {
    if (!pricing) return;
    const obj = pricing.objectives.find((o) => o.id === objective);
    if (obj) setBidAmount(String(obj.defaultBid));
    if (objective === "app_promotion") setAdFormat("app_install");
    else if (objective === "shopping") setAdFormat("shopping");
    else if (objective === "video_views") setAdFormat("video");
    else setAdFormat("image");
  }, [objective, pricing]);

  const handleAuth = async () => {
    setError("");
    const path = authMode === "login" ? "/login" : "/register";
    const body = authMode === "login" ? { email, password } : { email, password, companyName };
    const res = await api<{ success: boolean; message?: string; token?: string }>(path, {
      method: "POST", body: JSON.stringify(body),
    });
    if (!res.success) { setError(res.message ?? "Failed"); return; }
    if (res.token) localStorage.setItem("videh_ads_token", res.token);
    await loadDash();
  };

  const createCampaign = async () => {
    if (!newCampaign.trim()) return;
    setError("");
    const obj = pricing?.objectives.find((o) => o.id === objective);
    const res = await api<{ success: boolean; message?: string; code?: string }>("/campaigns", {
      method: "POST",
      body: JSON.stringify({
        name: newCampaign.trim(),
        objective,
        bidModel: obj?.bidModel,
        bidAmountInr: Number(bidAmount),
        dailyBudgetInr: Number(dailyBudget),
        totalBudgetInr: Number(totalBudget),
      }),
    });
    if (!res.success) {
      setError(res.message ?? "Could not create campaign");
      if (res.code === "PAYMENT_REQUIRED") setNav("billing");
      return;
    }
    setNewCampaign("");
    await loadDash();
    setNav("campaigns");
  };

  const createCreative = async () => {
    if (!selectedCampaign || !creativeTitle.trim()) return;
    setError("");
    const res = await api<{ success: boolean; message?: string; code?: string }>(`/campaigns/${selectedCampaign}/creatives`, {
      method: "POST",
      body: JSON.stringify({
        title: creativeTitle.trim(),
        format: adFormat,
        headline: headline.trim() || creativeTitle.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        videoUrl: videoUrl.trim(),
        destinationUrl: destinationUrl.trim(),
        playStoreUrl: playStoreUrl.trim(),
        appStoreUrl: appStoreUrl.trim(),
        appName: appName.trim(),
        placement: adFormat === "video" ? placement : "feed_instream",
        ctaType: adFormat === "shopping" ? "shop_now" : adFormat === "app_install" ? "install" : "learn_more",
        durationSeconds: adFormat === "video" ? 30 : 0,
      }),
    });
    if (!res.success) {
      setError(res.message ?? "Could not publish ad");
      if (res.code === "PAYMENT_REQUIRED") setNav("billing");
      return;
    }
    setCreativeTitle(""); setHeadline(""); setDescription("");
    setImageUrl(""); setVideoUrl(""); setDestinationUrl("");
    await loadDash();
  };

  const payWithRazorpay = async () => {
    setError("");
    setPaying(true);
    try {
      const amount = Number(topUpAmount);
      const orderRes = await api<{
        success: boolean;
        message?: string;
        checkout?: {
          orderId: string;
          amountInr: number;
          keyId: string;
          logoUrl?: string;
        };
      }>("/wallet/create-order", {
        method: "POST",
        body: JSON.stringify({ amountInr: amount }),
      });
      if (!orderRes.success || !orderRes.checkout) {
        throw new Error(orderRes.message ?? "Could not start payment");
      }
      const { checkout } = orderRes;
      await new Promise<void>((resolve, reject) => {
        openAdsRazorpayCheckout({
          keyId: checkout.keyId,
          orderId: checkout.orderId,
          amountInr: checkout.amountInr,
          logoUrl: checkout.logoUrl,
          companyName: advertiser?.company_name ?? "Advertiser",
          email: advertiser?.email ?? "",
          onSuccess: async (response) => {
            try {
              const verify = await api<{ success: boolean; message?: string }>("/wallet/verify-payment", {
                method: "POST",
                body: JSON.stringify({
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                }),
              });
              if (!verify.success) throw new Error(verify.message ?? "Verification failed");
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          onDismiss: () => reject(new Error("Payment cancelled")),
        });
      });
      await loadDash();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  const demoTopUp = async () => {
    setError("");
    const res = await api<{ success: boolean; message?: string }>("/wallet/demo-topup", {
      method: "POST", body: JSON.stringify({ amountInr: Number(topUpAmount) }),
    });
    if (!res.success) { setError(res.message ?? "Demo top-up failed"); return; }
    await loadDash();
  };

  if (screen === "auth") {
    return (
      <div style={S.authWrap}>
        <div style={S.authCard}>
          <div style={S.logoRow}>
            <div style={S.logoMark}>V</div>
            <div>
              <h1 style={S.h1}>Videh Ads</h1>
              <p style={S.sub}>Google Ads-style campaigns for Videh Video</p>
            </div>
          </div>
          <div style={S.tabRow}>
            <button type="button" style={authMode === "login" ? S.tabOn : S.tab} onClick={() => setAuthMode("login")}>Sign in</button>
            <button type="button" style={authMode === "register" ? S.tabOn : S.tab} onClick={() => setAuthMode("register")}>Create account</button>
          </div>
          {authMode === "register" && <input style={S.input} placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />}
          <input style={S.input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={S.input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p style={S.err}>{error}</p>}
          <button type="button" style={S.primary} onClick={() => void handleAuth()}>{authMode === "login" ? "Sign in" : "Register"}</button>
        </div>
      </div>
    );
  }

  const balance = Number(advertiser?.balance_inr ?? 0);
  const minPay = pricing?.minTopUpInr ?? walletConfig?.minTopUpInr ?? 500;
  const isFunded = balance >= minPay || walletConfig?.isDemoAccount;
  const canPublish = balance > 0 || walletConfig?.isDemoAccount;

  return (
    <div style={S.shell}>
      <aside style={S.sidebar}>
        <div style={S.logoRow}>
          <div style={S.logoMark}>V</div>
          <strong>Videh Ads</strong>
        </div>
        <nav style={S.nav}>
          {(["overview", "campaigns", "ads", "billing"] as Nav[]).map((id) => (
            <button key={id} type="button" style={nav === id ? S.navOn : S.navBtn} onClick={() => setNav(id)}>
              {id === "overview" ? "Overview" : id === "campaigns" ? "Campaigns" : id === "ads" ? "Ads & assets" : "Billing"}
            </button>
          ))}
        </nav>
        <div style={S.sideFoot}>
          <div style={S.balancePill}>₹{balance.toLocaleString("en-IN")}</div>
          <button type="button" style={S.ghost} onClick={() => { localStorage.removeItem("videh_ads_token"); setScreen("auth"); }}>Sign out</button>
        </div>
      </aside>

      <div style={S.mainCol}>
        <header style={S.topBar}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{advertiser?.company_name}</h2>
            <p style={S.sub}>Run ads on Videh home feed & video player — YouTube-style</p>
          </div>
        </header>

        <main style={S.main}>
          {!isFunded ? (
            <div style={S.payBanner}>
              <strong>Payment required</strong>
              <p style={{ margin: "6px 0 10px", fontSize: 14 }}>
                Add at least ₹{minPay.toLocaleString("en-IN")} via Razorpay (UPI / card / netbanking) before creating campaigns.
              </p>
              <button type="button" style={{ ...S.primary, width: "auto" }} onClick={() => setNav("billing")}>Go to Billing</button>
            </div>
          ) : null}

          {nav === "overview" && (
            <>
              <div style={S.statGrid}>
                <Stat label="Impressions" value={stats?.impressions ?? "0"} />
                <Stat label="Clicks" value={stats?.clicks ?? "0"} />
                <Stat label="Completed views" value={stats?.completions ?? "0"} />
                <Stat label="Spend" value={`₹${Number(stats?.spent_inr ?? 0).toFixed(0)}`} />
              </div>
              <Panel title="How Videh Ads work (like Google Ads)">
                <ul style={S.list}>
                  <li><strong>Home feed:</strong> Sponsored card every {pricing?.feedAdEveryVideos ?? 2} videos — app install, shopping, image ads</li>
                  <li><strong>Video watch:</strong> 30s non-skippable + 60s skippable pre-roll; mid-roll on long videos</li>
                  <li><strong>CPM</strong> ₹{pricing?.feedCpmInr}/1k impressions · <strong>CPC</strong> ₹{pricing?.feedCpcInr}/click · <strong>CPI</strong> ₹{pricing?.appInstallCpiInr}/store tap</li>
                </ul>
              </Panel>
            </>
          )}

          {nav === "campaigns" && (
            <>
              {!isFunded ? (
                <Panel title="Create campaign">
                  <p style={S.sub}>Fund your wallet first (minimum ₹{minPay}).</p>
                </Panel>
              ) : (
              <Panel title="Create campaign">
                <div style={S.grid2}>
                  <Field label="Campaign name">
                    <input style={S.input} value={newCampaign} onChange={(e) => setNewCampaign(e.target.value)} placeholder="Summer sale 2026" />
                  </Field>
                  <Field label="Campaign objective">
                    <select style={S.input} value={objective} onChange={(e) => setObjective(e.target.value)}>
                      {(pricing?.objectives ?? []).map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={BID_LABELS[pricing?.objectives.find((o) => o.id === objective)?.bidModel ?? "cpm"] ?? "Bid (INR)"}>
                    <input style={S.input} type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} />
                  </Field>
                  <Field label="Daily budget (₹)">
                    <input style={S.input} type="number" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
                  </Field>
                  <Field label="Total budget (₹)">
                    <input style={S.input} type="number" value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} />
                  </Field>
                </div>
                <button type="button" style={{ ...S.primary, width: "auto", marginTop: 12 }} onClick={() => void createCampaign()}>Create campaign</button>
              </Panel>
              )}

              <Panel title="Campaigns">
                {campaigns.length === 0 ? <p style={S.sub}>No campaigns yet.</p> : (
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Name</th>
                        <th style={S.th}>Objective</th>
                        <th style={S.th}>Bid</th>
                        <th style={S.th}>Spent / Budget</th>
                        <th style={S.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c) => (
                        <tr key={c.id} style={{ background: selectedCampaign === c.id ? "#e8f5f0" : undefined, cursor: "pointer" }}
                          onClick={() => { setSelectedCampaign(c.id); setNav("ads"); }}>
                          <td style={S.td}>{c.name}</td>
                          <td style={S.td}>{OBJECTIVE_LABELS[c.objective ?? ""] ?? c.objective}</td>
                          <td style={S.td}>₹{c.bid_amount_inr} {c.bid_model?.toUpperCase()}</td>
                          <td style={S.td}>₹{c.spent_inr} / ₹{c.total_budget_inr}</td>
                          <td style={S.td}>{c.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            </>
          )}

          {nav === "ads" && (
            <Panel title="Create ad">
              {!canPublish ? (
                <p style={S.err}>Pay and add funds before publishing ads.</p>
              ) : null}
              <div style={S.formatTabs}>
                {(["shopping", "app_install", "image", "video"] as const).map((f) => (
                  <button key={f} type="button" style={adFormat === f ? S.formatOn : S.formatTab}
                    onClick={() => setAdFormat(f)}>
                    {f === "shopping" ? "Shopping" : f === "app_install" ? "App install" : f === "image" ? "Image" : "Video"}
                  </button>
                ))}
              </div>

              <select style={S.input} value={selectedCampaign ?? ""} onChange={(e) => setSelectedCampaign(Number(e.target.value) || null)}>
                <option value="">Select campaign</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <div style={S.grid2}>
                <Field label="Ad name (internal)"><input style={S.input} value={creativeTitle} onChange={(e) => setCreativeTitle(e.target.value)} /></Field>
                <Field label="Headline"><input style={S.input} value={headline} onChange={(e) => setHeadline(e.target.value)} /></Field>
              </div>
              <Field label="Description"><textarea style={{ ...S.input, minHeight: 72 }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>

              {adFormat === "video" ? (
                <>
                  <Field label="Video URL (MP4)"><input style={S.input} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." /></Field>
                  <Field label="Placement">
                    <select style={S.input} value={placement} onChange={(e) => setPlacement(e.target.value)}>
                      <option value="pre_roll">Pre-roll (before video)</option>
                      <option value="mid_roll">Mid-roll (during video)</option>
                      <option value="feed_instream">Home feed</option>
                    </select>
                  </Field>
                </>
              ) : (
                <Field label="Image URL"><input style={S.input} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." /></Field>
              )}

              {adFormat === "shopping" && (
                <Field label="Shop URL (Shop Now button)"><input style={S.input} value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} /></Field>
              )}

              {adFormat === "app_install" && (
                <div style={S.grid2}>
                  <Field label="App name"><input style={S.input} value={appName} onChange={(e) => setAppName(e.target.value)} /></Field>
                  <Field label="Play Store URL"><input style={S.input} value={playStoreUrl} onChange={(e) => setPlayStoreUrl(e.target.value)} /></Field>
                  <Field label="App Store URL"><input style={S.input} value={appStoreUrl} onChange={(e) => setAppStoreUrl(e.target.value)} /></Field>
                </div>
              )}

              {adFormat === "image" && (
                <Field label="Landing page URL"><input style={S.input} value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} /></Field>
              )}

              <div style={S.preview}>
                <div style={S.previewLabel}>Preview (home feed)</div>
                <div style={S.previewCard}>
                  <div style={S.previewSponsored}>Sponsored · {advertiser?.company_name}</div>
                  {imageUrl && <img src={imageUrl} alt="" style={S.previewImg} />}
                  <div style={S.previewBody}>
                    <strong>{headline || creativeTitle || "Your headline"}</strong>
                    <p style={{ margin: "6px 0", color: "#5f6368", fontSize: 13 }}>{description || "Description"}</p>
                    {adFormat === "app_install" && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {playStoreUrl && <span style={S.fakeBtnGreen}>Get it on Play Store</span>}
                        {appStoreUrl && <span style={S.fakeBtnBlack}>Download on App Store</span>}
                      </div>
                    )}
                    {adFormat === "shopping" && <span style={S.fakeBtnTeal}>Shop Now</span>}
                  </div>
                </div>
              </div>

              <button type="button" style={S.primary} disabled={!canPublish} onClick={() => void createCreative()}>Publish ad</button>
            </Panel>
          )}

          {nav === "billing" && (
            <Panel title="Billing & payments">
              <p style={S.sub}>
                Pay upfront via Razorpay. Your balance is charged automatically when ads run (CPM / CPC / CPI / CPV).
              </p>
              {!walletConfig?.razorpayConfigured ? (
                <p style={S.err}>Payment gateway is not configured on the server. Contact support@videh.co.in.</p>
              ) : null}
              <div style={S.statGrid}>
                <Stat label="Available balance" value={`₹${balance.toLocaleString("en-IN")}`} />
                <Stat label="Total spend" value={`₹${Number(stats?.spent_inr ?? 0).toFixed(0)}`} />
              </div>
              <Field label={`Pay with Razorpay (min ₹${minPay})`}>
                <div style={S.row}>
                  <input style={{ ...S.input, flex: 1, marginBottom: 0 }} type="number" min={minPay} value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} />
                  <button
                    type="button"
                    style={{ ...S.primary, width: "auto", opacity: paying ? 0.7 : 1 }}
                    disabled={paying || !walletConfig?.razorpayConfigured}
                    onClick={() => void payWithRazorpay()}
                  >
                    {paying ? "Processing…" : "Pay now"}
                  </button>
                </div>
              </Field>
              {walletConfig?.isDemoAccount ? (
                <Field label="Demo credit (internal test account only)">
                  <div style={S.row}>
                    <button type="button" style={S.ghost} onClick={() => void demoTopUp()}>Add demo ₹{topUpAmount}</button>
                  </div>
                </Field>
              ) : null}
              {error && <p style={S.err}>{error}</p>}
              {payments.length > 0 ? (
                <>
                  <h4 style={{ margin: "16px 0 8px", fontSize: 14 }}>Payment history</h4>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>Date</th>
                        <th style={S.th}>Amount</th>
                        <th style={S.th}>Method</th>
                        <th style={S.th}>Payment ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.razorpay_payment_id}>
                          <td style={S.td}>{new Date(p.created_at).toLocaleString("en-IN")}</td>
                          <td style={S.td}>₹{Number(p.amount_inr).toLocaleString("en-IN")}</td>
                          <td style={S.td}>{p.payment_method ?? "—"}</td>
                          <td style={S.td}><code style={{ fontSize: 11 }}>{p.razorpay_payment_id}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </Panel>
          )}
        </main>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div style={S.stat}><div style={S.statL}>{label}</div><div style={S.statV}>{value}</div></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section style={S.panel}><h3 style={S.panelT}>{title}</h3>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={S.field}><span style={S.fieldL}>{label}</span>{children}</label>;
}

const S: Record<string, React.CSSProperties> = {
  shell: { display: "flex", minHeight: "100vh" },
  sidebar: { width: 240, background: "#fff", borderRight: "1px solid #dadce0", display: "flex", flexDirection: "column", padding: "16px 12px" },
  nav: { display: "flex", flexDirection: "column", gap: 4, flex: 1, marginTop: 20 },
  navBtn: { textAlign: "left", padding: "10px 12px", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", color: "#5f6368" },
  navOn: { textAlign: "left", padding: "10px 12px", border: "none", background: "#e8f5f0", borderRadius: 8, cursor: "pointer", color: "#00A884", fontWeight: 600 },
  sideFoot: { borderTop: "1px solid #e8eaed", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 },
  balancePill: { background: "#e8f5f0", color: "#00A884", fontWeight: 700, padding: "8px 12px", borderRadius: 8, fontSize: 14 },
  mainCol: { flex: 1, display: "flex", flexDirection: "column" },
  topBar: { background: "#fff", borderBottom: "1px solid #dadce0", padding: "16px 24px" },
  main: { padding: "20px 24px 48px", maxWidth: 1100 },
  authWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  authCard: { width: "100%", maxWidth: 440, background: "#fff", borderRadius: 12, padding: 28, boxShadow: "0 1px 3px rgba(0,0,0,.12)" },
  logoRow: { display: "flex", alignItems: "center", gap: 12 },
  logoMark: { width: 36, height: 36, borderRadius: 8, background: "#00A884", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 },
  h1: { margin: 0, fontSize: 22 },
  sub: { margin: "4px 0 0", color: "#5f6368", fontSize: 14 },
  tabRow: { display: "flex", gap: 8, margin: "16px 0" },
  tab: { flex: 1, padding: "10px", border: "1px solid #dadce0", background: "#fff", borderRadius: 8, cursor: "pointer" },
  tabOn: { flex: 1, padding: "10px", border: "1px solid #00A884", background: "#e8f5f0", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", marginBottom: 10, borderRadius: 8, border: "1px solid #dadce0", fontSize: 14 },
  primary: { padding: "11px 20px", background: "#00A884", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", width: "100%" },
  ghost: { padding: "8px", background: "transparent", border: "1px solid #dadce0", borderRadius: 8, cursor: "pointer" },
  err: { color: "#d93025", fontSize: 13 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 },
  stat: { background: "#fff", border: "1px solid #dadce0", borderRadius: 10, padding: 16 },
  statL: { fontSize: 12, color: "#5f6368" },
  statV: { fontSize: 22, fontWeight: 700, marginTop: 4 },
  panel: { background: "#fff", border: "1px solid #dadce0", borderRadius: 10, padding: 20, marginBottom: 16 },
  panelT: { margin: "0 0 14px", fontSize: 16 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  field: { display: "block", marginBottom: 10 },
  fieldL: { display: "block", fontSize: 12, color: "#5f6368", marginBottom: 4, fontWeight: 500 },
  row: { display: "flex", gap: 10, alignItems: "center" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #e8eaed", color: "#5f6368", fontWeight: 500 },
  td: { padding: "10px 6px", borderBottom: "1px solid #f1f3f4" },
  list: { margin: 0, paddingLeft: 20, lineHeight: 1.7, color: "#3c4043" },
  formatTabs: { display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  formatTab: { padding: "8px 14px", border: "1px solid #dadce0", background: "#fff", borderRadius: 20, cursor: "pointer", fontSize: 13 },
  formatOn: { padding: "8px 14px", border: "1px solid #00A884", background: "#e8f5f0", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  preview: { margin: "16px 0", padding: 14, background: "#f8f9fa", borderRadius: 10 },
  previewLabel: { fontSize: 11, color: "#80868b", marginBottom: 8, textTransform: "uppercase", fontWeight: 600 },
  previewCard: { background: "#fff", borderRadius: 10, overflow: "hidden", border: "1px solid #e8eaed", maxWidth: 360 },
  previewSponsored: { fontSize: 11, color: "#80868b", padding: "8px 12px" },
  previewImg: { width: "100%", height: 160, objectFit: "cover" },
  previewBody: { padding: 12 },
  fakeBtnTeal: { display: "inline-block", background: "#00A884", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, marginTop: 8 },
  fakeBtnGreen: { display: "inline-block", background: "#01875f", color: "#fff", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
  fakeBtnBlack: { display: "inline-block", background: "#000", color: "#fff", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
  payBanner: { background: "#fef7e0", border: "1px solid #f9e6b0", borderRadius: 10, padding: 16, marginBottom: 16 },
};
