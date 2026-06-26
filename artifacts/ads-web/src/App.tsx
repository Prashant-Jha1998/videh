import React, { useCallback, useEffect, useRef, useState } from "react";
import { InStreamAdPreview } from "./components/InStreamAdPreview";
import { AdsShell } from "./components/AdsShell";
import { GoogleSignInButton } from "./components/GoogleSignInButton";
import { MediaUploadField } from "./components/MediaUploadField";
import { VidehLogo } from "./components/VidehLogo";
import { BID_MODEL_LABELS, CATEGORY_LABELS, type AdFormatSpec } from "./lib/adFormats";
import {
  COMPATIBLE_FORMAT_IDS,
  DEFAULT_FORMAT_BY_OBJECTIVE,
  OBJECTIVE_HINTS,
  formatMatchesObjective,
  isCampaignObjective,
  recommendedFormatLabel,
} from "./lib/campaignObjective";
import { adsRequest, adsSignOut } from "./lib/adsClient";
import { openAdsRazorpayCheckout } from "./lib/razorpayCheckout";

type Advertiser = { id: number; email: string; company_name: string; balance_inr?: string };
type Campaign = {
  id: number; name: string; status: string; objective?: string;
  bid_model?: string; bid_amount_inr?: string;
  daily_budget_inr: string; total_budget_inr: string; spent_inr: string;
  start_date?: string; end_date?: string | null;
};
type DashboardCampaign = Campaign & {
  impressions: string; clicks: string;
  active_creatives: number; approved_creatives: number; pending_creatives: number;
  is_running: boolean; days_left: number | null;
};
type Dashboard = {
  summary: {
    total_campaigns: number; running_campaigns: number;
    total_spent_inr: string; impressions: string; clicks: string; completions: string;
  };
  campaigns: DashboardCampaign[];
  byCity: Array<{ city: string; state: string; impressions: string; clicks: string; spend_inr: string }>;
  byDay: Array<{ day: string; impressions: string; clicks: string; spend_inr: string }>;
  payments: { total_paid_inr: string; payment_count: number };
};
type Stats = { impressions: string; completions: string; skips: string; clicks?: string; spent_inr?: string; creatives: number };
type Pricing = {
  feedCpmInr: number; feedCpcInr: number; appInstallCpiInr: number; videoCpvInr: number; minTopUpInr: number;
  feedAdEveryVideos: number;
  objectives: Array<{ id: string; label: string; bidModel: string; defaultBid: number }>;
  adFormats?: AdFormatSpec[];
};
type Nav = "overview" | "campaigns" | "ads" | "billing";
type AdCreative = {
  id: number;
  title: string;
  format: string;
  placement: string;
  moderation_status: string;
  moderation_reason?: string | null;
  impressions: string;
  clicks: string;
  campaign_name: string;
  created_at: string;
};
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
  return adsRequest<T>(path, opts);
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
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  const [selectedAdFormatId, setSelectedAdFormatId] = useState("feed_shopping");
  const [adFormat, setAdFormat] = useState("shopping");
  const [adType, setAdType] = useState("non_skippable");
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [creativeTitle, setCreativeTitle] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [promoFile1, setPromoFile1] = useState<File | null>(null);
  const [promoFile2, setPromoFile2] = useState<File | null>(null);
  const [submittingAd, setSubmittingAd] = useState(false);
  const [destinationUrl, setDestinationUrl] = useState("");
  const [playStoreUrl, setPlayStoreUrl] = useState("");
  const [appStoreUrl, setAppStoreUrl] = useState("");
  const [appName, setAppName] = useState("");
  const [appDeveloper, setAppDeveloper] = useState("");
  const [appRating, setAppRating] = useState("");
  const [appReviewCount, setAppReviewCount] = useState("");
  const [appDownloadCount, setAppDownloadCount] = useState("");
  const [appCategory, setAppCategory] = useState("");
  const [appPriceLabel, setAppPriceLabel] = useState("FREE");
  const [playStoreLookupStatus, setPlayStoreLookupStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [playStoreLookupMessage, setPlayStoreLookupMessage] = useState("");
  const playStoreLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [promoImageUrl, setPromoImageUrl] = useState("");
  const [promoImageUrl2, setPromoImageUrl2] = useState("");
  const [placement, setPlacement] = useState("feed_instream");
  const [topUpAmount, setTopUpAmount] = useState("1000");
  const [walletConfig, setWalletConfig] = useState<WalletConfig | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paying, setPaying] = useState(false);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [successMsg, setSuccessMsg] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const imagePreviewSrc = useObjectUrl(imageFile) || imageUrl;
  const videoPreviewSrc = useObjectUrl(videoFile) || videoUrl;
  const promoPreview1 = useObjectUrl(promoFile1) || promoImageUrl;
  const promoPreview2 = useObjectUrl(promoFile2) || promoImageUrl2;

  const loadDash = useCallback(async () => {
    const me = await api<{ success: boolean; advertiser?: Advertiser }>("/me");
    if (!me.success || !me.advertiser) { setScreen("auth"); return; }
    setAdvertiser(me.advertiser);
    const [c, s, p, w, pay, cr, dash] = await Promise.all([
      api<{ success: boolean; campaigns: Campaign[] }>("/campaigns"),
      api<{ success: boolean; stats: Stats }>("/stats"),
      api<{ success: boolean; pricing: Pricing }>("/pricing"),
      api<{ success: boolean } & WalletConfig>("/wallet/config"),
      api<{ success: boolean; payments: PaymentRow[] }>("/wallet/payments"),
      api<{ success: boolean; creatives: AdCreative[] }>("/creatives"),
      api<{ success: boolean; dashboard: Dashboard }>("/dashboard"),
    ]);
    if (c.success) setCampaigns(c.campaigns);
    if (s.success) setStats(s.stats);
    if (dash.success) setDashboard(dash.dashboard);
    if (p.success) setPricing(p.pricing);
    if (w.success) setWalletConfig(w);
    if (pay.success) setPayments(pay.payments ?? []);
    if (cr.success) setCreatives(cr.creatives ?? []);
    setScreen("dash");
  }, []);

  useEffect(() => { void loadDash(); }, [loadDash]);

  const applyAdFormat = useCallback((spec: AdFormatSpec) => {
    setSelectedAdFormatId(spec.id);
    setAdFormat(spec.format);
    setPlacement(spec.placement);
    setAdType(spec.adType);
    if (spec.maxDurationSeconds) setDurationSeconds(spec.maxDurationSeconds);
    if (spec.format === "shopping") setObjective("shopping");
    else if (spec.format === "app_install") setObjective("app_promotion");
    else if (spec.category === "video_watch" || spec.category === "shorts") setObjective("video_views");
    else setObjective("brand_awareness");
  }, []);

  useEffect(() => {
    if (!pricing) return;
    const obj = pricing.objectives.find((o) => o.id === objective);
    if (obj) setBidAmount(String(obj.defaultBid));
  }, [objective, pricing]);

  useEffect(() => {
    const spec = pricing?.adFormats?.find((f) => f.id === selectedAdFormatId);
    if (spec) applyAdFormat(spec);
  }, [pricing, selectedAdFormatId, applyAdFormat]);

  const selectedCampaignRow = campaigns.find((c) => c.id === selectedCampaign);
  const selectedCampaignObjective = isCampaignObjective(selectedCampaignRow?.objective)
    ? selectedCampaignRow.objective
    : null;

  useEffect(() => {
    if (!selectedCampaignObjective || !pricing?.adFormats?.length) return;
    const defaultId = DEFAULT_FORMAT_BY_OBJECTIVE[selectedCampaignObjective];
    if (defaultId && defaultId !== selectedAdFormatId) {
      setSelectedAdFormatId(defaultId);
    }
  }, [selectedCampaign, selectedCampaignObjective, pricing?.adFormats]);

  const formatMismatch =
    selectedCampaignObjective && pricing?.adFormats
      ? !formatMatchesObjective(selectedAdFormatId, selectedCampaignObjective, pricing.adFormats)
      : false;

  const lookupPlayStoreDetails = useCallback(async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || adFormat !== "app_install") {
      setPlayStoreLookupStatus("idle");
      setPlayStoreLookupMessage("");
      return;
    }
    setPlayStoreLookupStatus("loading");
    setPlayStoreLookupMessage("Fetching app details from Google Play…");
    const res = await api<{
      success: boolean;
      message?: string;
      app?: {
        title: string;
        developer: string;
        iconUrl: string | null;
        rating: number | null;
        reviewCountLabel: string | null;
        installsLabel: string | null;
        category: string | null;
        priceLabel: string;
      };
    }>(`/play-store/lookup?url=${encodeURIComponent(trimmed)}`);
    if (!res.success || !res.app) {
      setPlayStoreLookupStatus("error");
      setPlayStoreLookupMessage(res.message ?? "Could not fetch from Play Store. Fill details manually below.");
      return;
    }
    const a = res.app;
    setAppName(a.title);
    setAppDeveloper(a.developer || "");
    if (a.iconUrl) {
      setImageUrl(a.iconUrl);
      setImageFile(null);
    }
    setAppRating(a.rating != null ? a.rating.toFixed(1) : "");
    setAppReviewCount(a.reviewCountLabel ?? "");
    setAppDownloadCount(a.installsLabel ?? "");
    setAppCategory(a.category ?? "");
    setAppPriceLabel(a.priceLabel || "FREE");
    if (!headline.trim()) setHeadline(a.title);
    setPlayStoreLookupStatus("ok");
    setPlayStoreLookupMessage("Loaded from Play Store. You can edit any field before submit.");
  }, [adFormat, headline]);

  useEffect(() => {
    if (adFormat !== "app_install") {
      setPlayStoreLookupStatus("idle");
      setPlayStoreLookupMessage("");
      return;
    }
    if (playStoreLookupTimer.current) clearTimeout(playStoreLookupTimer.current);
    const trimmed = playStoreUrl.trim();
    if (!trimmed || trimmed.length < 12) {
      setPlayStoreLookupStatus("idle");
      setPlayStoreLookupMessage("");
      return;
    }
    playStoreLookupTimer.current = setTimeout(() => {
      void lookupPlayStoreDetails(trimmed);
    }, 700);
    return () => {
      if (playStoreLookupTimer.current) clearTimeout(playStoreLookupTimer.current);
    };
  }, [playStoreUrl, adFormat, lookupPlayStoreDetails]);

  const handleAuth = async () => {
    setError("");
    const path = authMode === "login" ? "/login" : "/register";
    const body = authMode === "login" ? { email, password } : { email, password, companyName };
    const res = await api<{ success: boolean; message?: string; token?: string }>(path, {
      method: "POST", body: JSON.stringify(body),
    });
    if (!res.success) { setError(res.message ?? "Failed"); return; }
    await loadDash();
  };

  const handleSignOut = useCallback(async () => {
    await adsSignOut();
    setScreen("auth");
    setAdvertiser(null);
    setDashboard(null);
  }, []);

  const handleGoogleAuth = useCallback(async (credential: string) => {
    setAuthBusy(true);
    setError("");
    try {
      const res = await api<{ success: boolean; message?: string; token?: string }>("/google", {
        method: "POST",
        body: JSON.stringify({ credential }),
      });
      if (!res.success) {
        setError(res.message ?? "Google sign-in failed");
        return;
      }
      await loadDash();
    } finally {
      setAuthBusy(false);
    }
  }, [loadDash]);

  const createCampaign = async () => {
    if (!newCampaign.trim()) return;
    setError("");
    const obj = pricing?.objectives.find((o) => o.id === objective);
    const res = await api<{ success: boolean; message?: string; code?: string; campaign?: { id: number; objective?: string } }>("/campaigns", {
      method: "POST",
      body: JSON.stringify({
        name: newCampaign.trim(),
        objective,
        bidModel: obj?.bidModel,
        bidAmountInr: Number(bidAmount),
        dailyBudgetInr: Number(dailyBudget),
        totalBudgetInr: Number(totalBudget),
        startDate,
        endDate,
      }),
    });
    if (!res.success) {
      setError(res.message ?? "Could not create campaign");
      if (res.code === "PAYMENT_REQUIRED") setNav("billing");
      return;
    }
    setNewCampaign("");
    await loadDash();
    if (res.campaign?.id) {
      setSelectedCampaign(res.campaign.id);
      if (isCampaignObjective(res.campaign.objective)) {
        setSelectedAdFormatId(DEFAULT_FORMAT_BY_OBJECTIVE[res.campaign.objective]);
      }
      setNav("ads");
    } else {
      setNav("campaigns");
    }
  };

  const createCreative = async () => {
    if (!selectedCampaign || !creativeTitle.trim()) return;
    setError("");
    if (formatMismatch && selectedCampaignObjective) {
      setError(
        `This ad format does not match your ${OBJECTIVE_LABELS[selectedCampaignObjective]} campaign. `
        + `Use "${recommendedFormatLabel(selectedCampaignObjective, pricing?.adFormats ?? [])}" instead.`,
      );
      return;
    }
    if (adFormat === "app_install" && !playStoreUrl.trim() && !appStoreUrl.trim()) {
      setError("Play Store or App Store URL required for app install ads.");
      return;
    }
    if (adFormat === "shopping" && !destinationUrl.trim()) {
      setError("Shop URL required for shopping ads.");
      return;
    }
    setSubmittingAd(true);
    try {
      const fd = new FormData();
      fd.append("title", creativeTitle.trim());
      fd.append("adFormatId", selectedAdFormatId);
      fd.append("format", adFormat);
      fd.append("adType", adType);
      fd.append("headline", headline.trim() || creativeTitle.trim());
      fd.append("description", description.trim());
      fd.append("destinationUrl", destinationUrl.trim());
      fd.append("playStoreUrl", playStoreUrl.trim());
      fd.append("appStoreUrl", appStoreUrl.trim());
      fd.append("appName", appName.trim());
      fd.append("appDeveloper", appDeveloper.trim());
      fd.append("appRating", appRating.trim());
      fd.append("appReviewCount", appReviewCount.trim());
      fd.append("appDownloadCount", appDownloadCount.trim());
      fd.append("appCategory", appCategory.trim());
      fd.append("appPriceLabel", appPriceLabel.trim());
      fd.append("placement", placement);
      fd.append("ctaType", adFormat === "shopping" ? "shop_now" : adFormat === "app_install" ? "install" : "learn_more");
      fd.append("durationSeconds", String(durationSeconds));
      if (adType === "skippable") fd.append("skipAfterSeconds", "5");
      if (videoFile) fd.append("video", videoFile);
      else if (videoUrl.trim()) fd.append("videoUrl", videoUrl.trim());
      if (imageFile) fd.append("image", imageFile);
      else if (imageUrl.trim()) fd.append("imageUrl", imageUrl.trim());
      if (promoFile1) fd.append("promoImage1", promoFile1);
      else if (promoImageUrl.trim()) fd.append("promoImageUrl", promoImageUrl.trim());
      if (promoFile2) fd.append("promoImage2", promoFile2);
      else if (promoImageUrl2.trim()) fd.append("promoImageUrl2", promoImageUrl2.trim());

      const res = await api<{ success: boolean; message?: string; code?: string }>(
        `/campaigns/${selectedCampaign}/creatives`,
        { method: "POST", body: fd },
      );
      if (!res.success) {
        setError(res.message ?? "Could not publish ad");
        if (res.code === "PAYMENT_REQUIRED") setNav("billing");
        return;
      }
      setSuccessMsg(res.message ?? "Ad submitted for Videh admin review.");
      setCreativeTitle(""); setHeadline(""); setDescription("");
      setImageUrl(""); setVideoUrl(""); setDestinationUrl("");
      setImageFile(null); setVideoFile(null); setPromoFile1(null); setPromoFile2(null);
      setPlayStoreUrl(""); setAppStoreUrl(""); setAppName(""); setAppDeveloper("");
      setAppRating(""); setAppReviewCount(""); setAppDownloadCount(""); setAppCategory("");
      setPromoImageUrl(""); setPromoImageUrl2("");
      setPlayStoreLookupStatus("idle"); setPlayStoreLookupMessage("");
      await loadDash();
    } finally {
      setSubmittingAd(false);
    }
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
      <div className="ads-auth-wrap">
        <div className="ads-auth-card">
          <span className="ads-auth-badge">🔒 Secure advertiser portal</span>
          <div style={S.logoRow}>
            <VidehLogo size={40} />
            <div>
              <h1 style={S.h1}>Videh Ads</h1>
              <p style={S.sub}>Professional ad campaigns for Videh Video</p>
            </div>
          </div>
          <div style={S.tabRow}>
            <button type="button" style={authMode === "login" ? S.tabOn : S.tab} onClick={() => setAuthMode("login")}>Sign in</button>
            <button type="button" style={authMode === "register" ? S.tabOn : S.tab} onClick={() => setAuthMode("register")}>Create account</button>
          </div>
          <GoogleSignInButton
            mode={authMode}
            disabled={authBusy}
            onCredential={handleGoogleAuth}
          />
          <div style={S.authDivider}>
            <span style={S.authDividerLine} />
            <span style={S.authDividerText}>or use email</span>
            <span style={S.authDividerLine} />
          </div>
          {authMode === "register" && <input style={S.input} placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />}
          <input style={S.input} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input style={S.input} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p style={S.err}>{error}</p>}
          <button type="button" style={S.primary} disabled={authBusy} onClick={() => void handleAuth()}>{authMode === "login" ? "Sign in" : "Register"}</button>
        </div>
      </div>
    );
  }

  const balance = Number(advertiser?.balance_inr ?? 0);
  const minPay = pricing?.minTopUpInr ?? walletConfig?.minTopUpInr ?? 500;
  const isFunded = balance >= minPay || walletConfig?.isDemoAccount;
  const canPublish = balance > 0 || walletConfig?.isDemoAccount;

  return (
    <AdsShell
      nav={nav}
      onNav={setNav}
      companyName={advertiser?.company_name ?? "Videh Ads"}
      balance={balance}
      onSignOut={() => void handleSignOut()}
    >
          {!isFunded ? (
            <div className="ads-pay-banner">
              <strong>Payment required</strong>
              <p style={{ margin: "6px 0 10px", fontSize: 14 }}>
                Add at least ₹{minPay.toLocaleString("en-IN")} via Razorpay (UPI / card / netbanking) before creating campaigns.
              </p>
              <button type="button" style={{ ...S.primary, width: "auto" }} onClick={() => setNav("billing")}>Go to Billing</button>
            </div>
          ) : null}

          {nav === "overview" && (
            <>
              <div className="ads-stat-grid">
                <Stat label="Running campaigns" value={String(dashboard?.summary.running_campaigns ?? 0)} />
                <Stat label="Total campaigns" value={String(dashboard?.summary.total_campaigns ?? 0)} />
                <Stat label="Impressions" value={dashboard?.summary.impressions ?? stats?.impressions ?? "0"} />
                <Stat label="Clicks" value={dashboard?.summary.clicks ?? stats?.clicks ?? "0"} />
                <Stat label="Completed views" value={dashboard?.summary.completions ?? stats?.completions ?? "0"} />
                <Stat label="Ad spend" value={`₹${Number(dashboard?.summary.total_spent_inr ?? stats?.spent_inr ?? 0).toLocaleString("en-IN")}`} />
                <Stat label="Wallet paid (Razorpay)" value={`₹${Number(dashboard?.payments?.total_paid_inr ?? 0).toLocaleString("en-IN")}`} />
                <Stat label="Wallet balance" value={`₹${balance.toLocaleString("en-IN")}`} />
              </div>

              <Panel title={`Live campaigns (${dashboard?.summary.running_campaigns ?? 0} chal rahi hain)`}>
                {(dashboard?.campaigns.filter((c) => c.is_running) ?? []).length === 0 ? (
                  <p style={S.sub}>No campaigns are live yet. Create a campaign, submit an ad, and it will run after admin approval.</p>
                ) : (
                  <div className="ads-table-wrap"><table className="ads-table">
                    <thead>
                      <tr>
                        <th className="ads-th">Campaign</th>
                        <th className="ads-th">Schedule</th>
                        <th className="ads-th">Days left</th>
                        <th className="ads-th">Spend / Budget</th>
                        <th className="ads-th">Impressions</th>
                        <th className="ads-th">Clicks</th>
                        <th className="ads-th">Live ads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard!.campaigns.filter((c) => c.is_running).map((c) => (
                        <tr key={c.id}>
                          <td className="ads-td"><strong>{c.name}</strong><div style={S.sub}>{OBJECTIVE_LABELS[c.objective ?? ""] ?? c.objective}</div></td>
                          <td className="ads-td">{fmtDate(c.start_date)} → {c.end_date ? fmtDate(c.end_date) : "No end"}</td>
                          <td className="ads-td">{c.days_left != null ? `${c.days_left} days` : "—"}</td>
                          <td className="ads-td">₹{Number(c.spent_inr).toLocaleString("en-IN")} / ₹{Number(c.total_budget_inr).toLocaleString("en-IN")}</td>
                          <td className="ads-td">{Number(c.impressions).toLocaleString("en-IN")}</td>
                          <td className="ads-td">{Number(c.clicks).toLocaleString("en-IN")}</td>
                          <td className="ads-td">{c.approved_creatives} live · {c.pending_creatives} pending</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </Panel>

              <Panel title="All campaigns">
                {(dashboard?.campaigns ?? []).length === 0 ? <p style={S.sub}>No campaigns yet.</p> : (
                  <div className="ads-table-wrap"><table className="ads-table">
                    <thead>
                      <tr>
                        <th className="ads-th">Name</th>
                        <th className="ads-th">Status</th>
                        <th className="ads-th">Start → End</th>
                        <th className="ads-th">Spend</th>
                        <th className="ads-th">Impressions</th>
                        <th className="ads-th">Clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard!.campaigns.map((c) => (
                        <tr key={c.id}>
                          <td className="ads-td">{c.name}</td>
                          <td className="ads-td">
                            <span style={{ color: c.is_running ? "#188038" : "#5f6368", fontWeight: 600 }}>
                              {c.is_running ? "Running" : c.status}
                            </span>
                          </td>
                          <td className="ads-td">{fmtDate(c.start_date)} → {c.end_date ? fmtDate(c.end_date) : "—"}</td>
                          <td className="ads-td">₹{Number(c.spent_inr).toLocaleString("en-IN")}</td>
                          <td className="ads-td">{Number(c.impressions).toLocaleString("en-IN")}</td>
                          <td className="ads-td">{Number(c.clicks).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </Panel>

              <Panel title="Performance by city (last 30 days)">
                {(dashboard?.byCity ?? []).length === 0 ? (
                  <p style={S.sub}>Jab ads chalengi, yahan city-wise impressions dikhengi.</p>
                ) : (
                  <div className="ads-table-wrap"><table className="ads-table">
                    <thead>
                      <tr>
                        <th className="ads-th">City</th>
                        <th className="ads-th">State</th>
                        <th className="ads-th">Impressions</th>
                        <th className="ads-th">Clicks</th>
                        <th className="ads-th">Spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard!.byCity.map((row, i) => (
                        <tr key={`${row.city}-${row.state}-${i}`}>
                          <td className="ads-td">{row.city}</td>
                          <td className="ads-td">{row.state}</td>
                          <td className="ads-td">{Number(row.impressions).toLocaleString("en-IN")}</td>
                          <td className="ads-td">{Number(row.clicks).toLocaleString("en-IN")}</td>
                          <td className="ads-td">₹{Number(row.spend_inr).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </Panel>

              <Panel title="Daily performance (last 30 days)">
                {(dashboard?.byDay ?? []).length === 0 ? (
                  <p style={S.sub}>No daily data yet.</p>
                ) : (
                  <div className="ads-table-wrap"><table className="ads-table">
                    <thead>
                      <tr>
                        <th className="ads-th">Date</th>
                        <th className="ads-th">Impressions</th>
                        <th className="ads-th">Clicks</th>
                        <th className="ads-th">Spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard!.byDay.map((row) => (
                        <tr key={row.day}>
                          <td className="ads-td">{fmtDate(row.day)}</td>
                          <td className="ads-td">{Number(row.impressions).toLocaleString("en-IN")}</td>
                          <td className="ads-td">{Number(row.clicks).toLocaleString("en-IN")}</td>
                          <td className="ads-td">₹{Number(row.spend_inr).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </Panel>

              <AdFormatsCatalog
                formats={pricing?.adFormats ?? []}
                onSelect={(id) => { setSelectedAdFormatId(id); setNav("ads"); }}
              />

              <Panel title="Billing rates">
                <ul style={S.list}>
                  <li><strong>CPM</strong> ₹{pricing?.feedCpmInr}/1,000 impressions (feed & bumper)</li>
                  <li><strong>CPC</strong> ₹{pricing?.feedCpcInr}/click (shopping, discovery, overlay)</li>
                  <li><strong>CPI</strong> ₹{pricing?.appInstallCpiInr}/app store tap</li>
                  <li><strong>CPV</strong> ₹{pricing?.videoCpvInr}/completed video view (pre-roll, mid-roll, shorts)</li>
                  <li>Har ad <strong>Videh admin approve</strong> ke baad hi public hota hai</li>
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
                  <Field label="Start date">
                    <input style={S.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </Field>
                  <Field label="End date">
                    <input style={S.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </Field>
                </div>
                {isCampaignObjective(objective) ? (
                  <p className="ads-objective-hint">{OBJECTIVE_HINTS[objective]}</p>
                ) : null}
                <button type="button" style={{ ...S.primary, width: "auto", marginTop: 12 }} onClick={() => void createCampaign()}>Create campaign</button>
              </Panel>
              )}

              <Panel title="Campaigns">
                {campaigns.length === 0 ? <p style={S.sub}>No campaigns yet.</p> : (
                  <div className="ads-table-wrap"><table className="ads-table">
                    <thead>
                      <tr>
                        <th className="ads-th">Name</th>
                        <th className="ads-th">Objective</th>
                        <th className="ads-th">Bid</th>
                        <th className="ads-th">Schedule</th>
                        <th className="ads-th">Spent / Budget</th>
                        <th className="ads-th">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c) => (
                        <tr key={c.id} style={{ background: selectedCampaign === c.id ? "#E8E6FF" : undefined, cursor: "pointer" }}
                          onClick={() => {
                            setSelectedCampaign(c.id);
                            if (isCampaignObjective(c.objective)) {
                              setSelectedAdFormatId(DEFAULT_FORMAT_BY_OBJECTIVE[c.objective]);
                            }
                            setNav("ads");
                          }}>
                          <td className="ads-td">{c.name}</td>
                          <td className="ads-td">{OBJECTIVE_LABELS[c.objective ?? ""] ?? c.objective}</td>
                          <td className="ads-td">₹{c.bid_amount_inr} {c.bid_model?.toUpperCase()}</td>
                          <td className="ads-td">{fmtDate(c.start_date)} → {c.end_date ? fmtDate(c.end_date) : "—"}</td>
                          <td className="ads-td">₹{c.spent_inr} / ₹{c.total_budget_inr}</td>
                          <td className="ads-td">{c.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </Panel>
            </>
          )}

          {nav === "ads" && (
            <>
            <Panel title="Your ads">
              {creatives.length === 0 ? <p style={S.sub}>No ads yet.</p> : (
                <div className="ads-table-wrap"><table className="ads-table">
                  <thead>
                    <tr>
                      <th className="ads-th">Title</th>
                      <th className="ads-th">Format</th>
                      <th className="ads-th">Placement</th>
                      <th className="ads-th">Campaign</th>
                      <th className="ads-th">Status</th>
                      <th className="ads-th">Impressions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creatives.map((cr) => (
                      <tr key={cr.id}>
                        <td className="ads-td">{cr.title}</td>
                        <td className="ads-td">{cr.format}</td>
                        <td className="ads-td">{cr.placement}</td>
                        <td className="ads-td">{cr.campaign_name}</td>
                        <td className="ads-td">
                          <StatusBadge status={cr.moderation_status} reason={cr.moderation_reason} />
                        </td>
                        <td className="ads-td">{cr.impressions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </Panel>
            <Panel title="Create ad">
              {!canPublish ? (
                <p className="ads-sub ads-sub--error">Pay and add funds before publishing ads.</p>
              ) : null}
              {successMsg ? <p className="ads-success-msg">{successMsg}</p> : null}
              {error && nav === "ads" ? <p className="ads-sub ads-sub--error">{error}</p> : null}

              <div className="ads-create-layout">
                <div className="ads-create-form">
              <p className="ads-sub" style={{ marginBottom: 12 }}>Choose ad format and upload your creative assets.</p>
              {selectedCampaignObjective ? (
                <div className={`ads-campaign-format-banner${formatMismatch ? " ads-campaign-format-banner--warn" : ""}`}>
                  <strong>{OBJECTIVE_LABELS[selectedCampaignObjective]} campaign</strong>
                  <p>{OBJECTIVE_HINTS[selectedCampaignObjective]}</p>
                  {formatMismatch ? (
                    <button
                      type="button"
                      className="ads-format-fix-btn"
                      onClick={() => setSelectedAdFormatId(DEFAULT_FORMAT_BY_OBJECTIVE[selectedCampaignObjective])}
                    >
                      Switch to {recommendedFormatLabel(selectedCampaignObjective, pricing?.adFormats ?? [])}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <AdFormatsCatalog
                formats={pricing?.adFormats ?? []}
                compact
                selectedId={selectedAdFormatId}
                recommendedIds={selectedCampaignObjective ? COMPATIBLE_FORMAT_IDS[selectedCampaignObjective] : undefined}
                onSelect={setSelectedAdFormatId}
              />
              {pricing?.adFormats?.find((f) => f.id === selectedAdFormatId && !f.live) ? (
                <p style={{ color: "#e37400", fontSize: 13, margin: "10px 0" }}>
                  This format is in the catalog — full player support is coming soon. You can still submit for admin review.
                </p>
              ) : null}

              <select style={S.input} value={selectedCampaign ?? ""} onChange={(e) => setSelectedCampaign(Number(e.target.value) || null)}>
                <option value="">Select campaign</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <div style={S.grid2}>
                <Field label="Ad name (internal)"><input style={S.input} value={creativeTitle} onChange={(e) => setCreativeTitle(e.target.value)} /></Field>
                <Field label="Headline"><input style={S.input} value={headline} onChange={(e) => setHeadline(e.target.value)} /></Field>
              </div>
              <Field label="Description"><textarea style={{ ...S.input, minHeight: 72 }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>

              {["video", "bumper", "shorts_video"].includes(adFormat) ? (
                <>
                  <MediaUploadField
                    label={`Video (MP4) — max ${durationSeconds}s`}
                    accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                    hint="MP4/WebM. Max 500 MB. Stored on Videh secure cloud (AWS S3)."
                    file={videoFile}
                    onFileChange={setVideoFile}
                    urlValue={videoUrl}
                    onUrlChange={setVideoUrl}
                    previewType="video"
                    previewSrc={videoPreviewSrc}
                  />
                  <Field label="Duration (seconds)">
                    <input style={S.input} type="number" min={adFormat === "bumper" ? 6 : 5} max={durationSeconds} value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))} />
                  </Field>
                </>
              ) : null}

              {!["video", "bumper", "shorts_video"].includes(adFormat) ? (
                <MediaUploadField
                  label="Ad image"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  hint="JPG, PNG or WebP. Uploaded to Videh secure cloud (AWS S3)."
                  file={imageFile}
                  onFileChange={setImageFile}
                  urlValue={imageUrl}
                  onUrlChange={setImageUrl}
                  previewType="image"
                  previewSrc={imagePreviewSrc}
                />
              ) : null}

              {adFormat === "video" && placement === "feed_instream" ? (
                <MediaUploadField
                  label="Thumbnail image (optional)"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  file={imageFile}
                  onFileChange={setImageFile}
                  urlValue={imageUrl}
                  onUrlChange={setImageUrl}
                  previewType="image"
                  previewSrc={imagePreviewSrc}
                />
              ) : null}

              {(adFormat === "shopping" || adFormat === "carousel") && (
                <Field label="Shop URL (Shop Now button)"><input style={S.input} value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} /></Field>
              )}
              {adFormat === "lead_form" && (
                <Field label="Lead / signup URL"><input style={S.input} value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://yoursite.com/signup" /></Field>
              )}

              {adFormat === "app_install" && (
                <>
                  <Field label="Play Store URL (auto-fills app details)">
                    <input
                      style={S.input}
                      value={playStoreUrl}
                      onChange={(e) => setPlayStoreUrl(e.target.value)}
                      placeholder="https://play.google.com/store/apps/details?id=com.example.app"
                    />
                  </Field>
                  {playStoreLookupStatus !== "idle" ? (
                    <p style={{
                      fontSize: 13,
                      margin: "0 0 10px",
                      color: playStoreLookupStatus === "error" ? "#d93025" : playStoreLookupStatus === "ok" ? "#188038" : "#5f6368",
                    }}>
                      {playStoreLookupMessage}
                    </p>
                  ) : (
                    <p style={{ fontSize: 12, color: "#80868b", margin: "0 0 10px" }}>
                      Paste Play Store link — rating, reviews, downloads, category auto-fill honge. Agar fetch fail ho to neeche manually bharo.
                    </p>
                  )}
                  <div style={S.grid2}>
                    <Field label="App name"><input style={S.input} value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="From Play Store or manual" /></Field>
                    <Field label="Developer name"><input style={S.input} value={appDeveloper} onChange={(e) => setAppDeveloper(e.target.value)} placeholder={advertiser?.company_name ?? "Developer"} /></Field>
                    <Field label="App Store URL (optional)"><input style={S.input} value={appStoreUrl} onChange={(e) => setAppStoreUrl(e.target.value)} /></Field>
                  </div>
                  <MediaUploadField
                    label="App icon"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    hint="Auto-filled from Play Store, or upload your own."
                    file={imageFile}
                    onFileChange={setImageFile}
                    urlValue={imageUrl}
                    onUrlChange={setImageUrl}
                    previewType="image"
                    previewSrc={imagePreviewSrc}
                  />
                  <div style={S.grid2}>
                    <Field label="Rating"><input style={S.input} value={appRating} onChange={(e) => setAppRating(e.target.value)} placeholder="e.g. 4.3" /></Field>
                    <Field label="Reviews"><input style={S.input} value={appReviewCount} onChange={(e) => setAppReviewCount(e.target.value)} placeholder="e.g. 150K reviews" /></Field>
                    <Field label="Downloads"><input style={S.input} value={appDownloadCount} onChange={(e) => setAppDownloadCount(e.target.value)} placeholder="e.g. 13M+" /></Field>
                    <Field label="Category"><input style={S.input} value={appCategory} onChange={(e) => setAppCategory(e.target.value)} placeholder="e.g. Health & Fitness" /></Field>
                    <Field label="Price label"><input style={S.input} value={appPriceLabel} onChange={(e) => setAppPriceLabel(e.target.value)} placeholder="FREE" /></Field>
                  </div>
                  <div className="ads-form-grid-2">
                    <MediaUploadField
                      label="Promo card image 1"
                      accept="image/jpeg,image/png,image/webp"
                      file={promoFile1}
                      onFileChange={setPromoFile1}
                      urlValue={promoImageUrl}
                      onUrlChange={setPromoImageUrl}
                      previewType="image"
                      previewSrc={promoPreview1}
                    />
                    <MediaUploadField
                      label="Promo card image 2"
                      accept="image/jpeg,image/png,image/webp"
                      file={promoFile2}
                      onFileChange={setPromoFile2}
                      urlValue={promoImageUrl2}
                      onUrlChange={setPromoImageUrl2}
                      previewType="image"
                      previewSrc={promoPreview2}
                    />
                  </div>
                </>
              )}

              {["video", "bumper"].includes(adFormat) && (placement === "pre_roll" || placement === "mid_roll" || placement === "any") ? (
                <div className="ads-form-grid-2">
                  <Field label="Landing page URL (Learn more)"><input style={S.input} value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://..." /></Field>
                  <MediaUploadField
                    label="Promo card image (optional)"
                    accept="image/jpeg,image/png,image/webp"
                    file={promoFile1}
                    onFileChange={setPromoFile1}
                    urlValue={promoImageUrl}
                    onUrlChange={setPromoImageUrl}
                    previewType="image"
                    previewSrc={promoPreview1}
                  />
                </div>
              ) : null}

              {(adFormat === "image" || placement === "search_promoted" || placement === "channel_banner" || placement === "video_overlay") && (
                <Field label="Landing page URL"><input style={S.input} value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} /></Field>
              )}

              <button type="button" className="ads-submit-btn" disabled={!canPublish || submittingAd} onClick={() => void createCreative()}>
                {submittingAd ? "Uploading…" : "Submit for review"}
              </button>
              <p className="ads-form-note">
                The ad will not appear publicly until a Videh admin approves it.
              </p>
                </div>

                <aside className="ads-create-previews" aria-label="Ad previews">
              <div className="ads-preview-block">
                <div className="ads-preview-label">Preview — in-stream ad (in-stream video)</div>
                <InStreamAdPreview
                  videoSrc={videoPreviewSrc}
                  iconSrc={imagePreviewSrc}
                  headline={
                    adFormat === "app_install"
                      ? appName || headline || creativeTitle || "App title"
                      : headline || creativeTitle || "Your headline"
                  }
                  subtitle={
                    adFormat === "app_install"
                      ? appDeveloper || advertiser?.company_name || "Developer"
                      : advertiser?.company_name ?? "Advertiser"
                  }
                  description={description || "Description shown below the video while ad plays."}
                  ctaLabel={adFormat === "app_install" ? "Install" : adFormat === "shopping" ? "Shop now" : "Watch now"}
                  isAppInstall={adFormat === "app_install"}
                  appPriceLabel={appPriceLabel}
                  appRating={appRating}
                  appReviewCount={appReviewCount}
                  appDownloadCount={appDownloadCount}
                  appCategory={appCategory}
                  promoImages={[promoPreview1, promoPreview2].filter(Boolean) as string[]}
                  destinationHint={
                    adFormat === "shopping" && destinationUrl
                      ? destinationUrl.replace(/^https?:\/\//, "").slice(0, 40)
                      : undefined
                  }
                />
              </div>

              <div className="ads-preview-block">
                <div className="ads-preview-label">Preview — home feed card</div>
                <div className="ads-feed-preview">
                  <div className="ads-preview-sponsored">Sponsored · {advertiser?.company_name}</div>
                  {imagePreviewSrc ? (
                    <div className="ads-feed-preview-img-wrap">
                      <img src={imagePreviewSrc} alt="" className="ads-feed-preview-img" />
                    </div>
                  ) : (
                    <div className="ads-feed-preview-img-ph" />
                  )}
                  <div className="ads-feed-preview-body">
                    <strong>{headline || creativeTitle || "Your headline"}</strong>
                    <p className="ads-preview-muted">{description || "Description"}</p>
                    {adFormat === "app_install" && (
                      <div className="ads-feed-btns">
                        {playStoreUrl && <span className="ads-fake-btn ads-fake-btn--green">Get it on Play Store</span>}
                        {appStoreUrl && <span className="ads-fake-btn ads-fake-btn--black">Download on App Store</span>}
                      </div>
                    )}
                    {adFormat === "shopping" && <span className="ads-fake-btn ads-fake-btn--teal">Shop Now</span>}
                  </div>
                </div>
              </div>
                </aside>
              </div>
            </Panel>
            </>
          )}

          {nav === "billing" && (
            <Panel title="Billing & payments">
              <p style={S.sub}>
                Pay upfront via Razorpay. Your balance is charged automatically when ads run (CPM / CPC / CPI / CPV).
              </p>
              {!walletConfig?.razorpayConfigured ? (
                <p style={S.err}>Payment gateway is not configured on the server. Contact support@videh.co.in.</p>
              ) : null}
              <div className="ads-stat-grid">
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
                  <div className="ads-table-wrap"><table className="ads-table">
                    <thead>
                      <tr>
                        <th className="ads-th">Date</th>
                        <th className="ads-th">Amount</th>
                        <th className="ads-th">Method</th>
                        <th className="ads-th">Payment ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.razorpay_payment_id}>
                          <td className="ads-td">{new Date(p.created_at).toLocaleString("en-IN")}</td>
                          <td className="ads-td">₹{Number(p.amount_inr).toLocaleString("en-IN")}</td>
                          <td className="ads-td">{p.payment_method ?? "—"}</td>
                          <td className="ads-td"><code style={{ fontSize: 11 }}>{p.razorpay_payment_id}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </>
              ) : null}
            </Panel>
          )}
    </AdsShell>
  );
}

function AdFormatsCatalog({
  formats,
  onSelect,
  compact,
  selectedId,
  recommendedIds,
}: {
  formats: AdFormatSpec[];
  onSelect: (id: string) => void;
  compact?: boolean;
  selectedId?: string;
  recommendedIds?: string[];
}) {
  const categories = ["video_watch", "home_feed", "shorts", "display"] as const;
  return (
    <Panel title={compact ? "Ad format" : "All ad formats on Videh"}>
      {categories.map((cat) => {
        const items = formats.filter((f) => f.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat} style={{ marginBottom: compact ? 12 : 20 }}>
            {!compact ? <h4 style={{ margin: "0 0 10px", fontSize: 14, color: "#3c4043" }}>{CATEGORY_LABELS[cat]}</h4> : null}
            <div style={compact ? S.formatGridCompact : S.formatGrid}>
              {items.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  style={{
                    ...(compact ? S.formatCardCompact : S.formatCard),
                    ...(selectedId === f.id ? S.formatCardOn : {}),
                  }}
                  onClick={() => onSelect(f.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <strong style={{ fontSize: compact ? 13 : 14 }}>{f.label}</strong>
                    <span style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {recommendedIds?.includes(f.id) ? (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                          background: "#E8E6FF", color: "#5B4FE8",
                        }}>
                          RECOMMENDED
                        </span>
                      ) : null}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                        background: f.live ? "#e6f4ea" : "#fef7e0", color: f.live ? "#137333" : "#b06000",
                      }}>
                        {f.live ? "LIVE" : "SOON"}
                      </span>
                    </span>
                  </div>
                  {!compact ? <p style={{ margin: "6px 0 0", fontSize: 12, color: "#5f6368", textAlign: "left" }}>{f.description}</p> : null}
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "#80868b", textAlign: "left" }}>
                    {f.where} · {BID_MODEL_LABELS[f.bidModel] ?? f.bidModel}
                  </p>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}

function useObjectUrl(file: File | null): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ads-stat">
      <div className="ads-stat-label">{label}</div>
      <div className="ads-stat-value">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ads-panel">
      <h3 className="ads-panel-title">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={S.field}><span style={S.fieldL}>{label}</span>{children}</label>;
}

function StatusBadge({ status, reason }: { status: string; reason?: string | null }) {
  const colors: Record<string, string> = {
    pending_review: "#e37400",
    approved: "#188038",
    rejected: "#d93025",
  };
  const labels: Record<string, string> = {
    pending_review: "Pending review",
    approved: "Live",
    rejected: "Rejected",
  };
  return (
    <span title={reason ?? undefined} style={{ color: colors[status] ?? "#5f6368", fontWeight: 600, fontSize: 13 }}>
      {labels[status] ?? status}
    </span>
  );
}

const S: Record<string, React.CSSProperties> = {
  shell: { display: "flex", minHeight: "100vh" },
  sidebar: { width: 240, background: "#fff", borderRight: "1px solid #dadce0", display: "flex", flexDirection: "column", padding: "16px 12px" },
  nav: { display: "flex", flexDirection: "column", gap: 4, flex: 1, marginTop: 20 },
  navBtn: { textAlign: "left", padding: "10px 12px", border: "none", background: "transparent", borderRadius: 8, cursor: "pointer", color: "#5f6368" },
  navOn: { textAlign: "left", padding: "10px 12px", border: "none", background: "#E8E6FF", borderRadius: 8, cursor: "pointer", color: "#5B4FE8", fontWeight: 600 },
  sideFoot: { borderTop: "1px solid #e8eaed", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 },
  balancePill: { background: "#E8E6FF", color: "#5B4FE8", fontWeight: 700, padding: "8px 12px", borderRadius: 8, fontSize: 14 },
  mainCol: { flex: 1, display: "flex", flexDirection: "column" },
  topBar: { background: "#fff", borderBottom: "1px solid #dadce0", padding: "16px 24px" },
  main: { padding: "20px 24px 48px", maxWidth: 1100 },
  authWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  authCard: { width: "100%", maxWidth: 440, background: "#fff", borderRadius: 12, padding: 28, boxShadow: "0 1px 3px rgba(0,0,0,.12)" },
  logoRow: { display: "flex", alignItems: "center", gap: 12 },
  h1: { margin: 0, fontSize: 22 },
  sub: { margin: "4px 0 0", color: "#5f6368", fontSize: 14 },
  tabRow: { display: "flex", gap: 8, margin: "16px 0" },
  tab: { flex: 1, padding: "10px", border: "1px solid #dadce0", background: "#fff", borderRadius: 8, cursor: "pointer" },
  tabOn: { flex: 1, padding: "10px", border: "1px solid #5B4FE8", background: "#E8E6FF", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  authDivider: { display: "flex", alignItems: "center", gap: 10, margin: "4px 0 14px" },
  authDividerLine: { flex: 1, height: 1, background: "#e8eaed" },
  authDividerText: { fontSize: 11, fontWeight: 600, color: "#80868b", textTransform: "uppercase", letterSpacing: "0.04em" },
  input: { width: "100%", padding: "10px 12px", marginBottom: 10, borderRadius: 8, border: "1px solid #dadce0", fontSize: 14 },
  primary: { padding: "11px 20px", background: "#5B4FE8", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", width: "100%" },
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
  formatGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 },
  formatGridCompact: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8 },
  formatCard: { textAlign: "left", padding: 14, border: "1px solid #dadce0", background: "#fff", borderRadius: 10, cursor: "pointer" },
  formatCardCompact: { textAlign: "left", padding: 10, border: "1px solid #dadce0", background: "#fff", borderRadius: 8, cursor: "pointer" },
  formatCardOn: { border: "2px solid #5B4FE8", background: "#E8E6FF" },
  preview: { margin: "16px 0", padding: 14, background: "#f8f9fa", borderRadius: 10 },
  previewLabel: { fontSize: 11, color: "#80868b", marginBottom: 8, textTransform: "uppercase", fontWeight: 600 },
  previewCard: { background: "#fff", borderRadius: 10, overflow: "hidden", border: "1px solid #e8eaed", maxWidth: 360 },
  previewSponsored: { fontSize: 11, color: "#80868b", padding: "8px 12px" },
  previewImg: { width: "100%", height: 160, objectFit: "cover" },
  previewBody: { padding: 12 },
  fakeBtnTeal: { display: "inline-block", background: "#5B4FE8", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, marginTop: 8 },
  fakeBtnGreen: { display: "inline-block", background: "#01875f", color: "#fff", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
  fakeBtnBlack: { display: "inline-block", background: "#000", color: "#fff", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
  payBanner: { background: "#fef7e0", border: "1px solid #f9e6b0", borderRadius: 10, padding: 16, marginBottom: 16 },
  instreamPreview: { background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #e8eaed", maxWidth: 380 },
  instreamVideoMock: { height: 180, background: "#111", color: "#fff", position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between" },
  instreamVideoTop: { display: "flex", padding: 10, fontSize: 12 },
  instreamVisit: { fontWeight: 600 },
  instreamVideoBottom: { display: "flex", justifyContent: "space-between", padding: "0 10px 10px", fontSize: 12, fontWeight: 600 },
  instreamSkip: { background: "rgba(255,255,255,0.92)", color: "#111", padding: "6px 10px", borderRadius: 4 },
  instreamProgress: { height: 3, background: "#F2C94C" },
  instreamPanel: { padding: 14 },
  instreamPanelHead: { fontSize: 16, marginBottom: 10 },
  instreamIdentity: { display: "flex", gap: 12, alignItems: "flex-start" },
  instreamIcon: { width: 52, height: 52, borderRadius: 12, objectFit: "cover" },
  instreamIconPlaceholder: { width: 52, height: 52, borderRadius: 12, background: "#e8eaed" },
  instreamStats: { display: "flex", gap: 16, margin: "12px 0", padding: "10px 0", borderTop: "1px solid #e8eaed", borderBottom: "1px solid #e8eaed", fontSize: 13 },
  statSub: { fontSize: 11, color: "#5f6368", marginTop: 2 },
  instreamPromo: { width: 96, height: 170, borderRadius: 10, objectFit: "cover", flex: "0 0 auto" },
  instreamActions: { display: "flex", gap: 10, marginTop: 12 },
  instreamLearn: { flex: 1, textAlign: "center", background: "#f1f3f4", padding: "10px 0", borderRadius: 24, fontWeight: 600, fontSize: 13 },
  instreamInstall: { flex: 1, textAlign: "center", background: "#111", color: "#fff", padding: "10px 0", borderRadius: 24, fontWeight: 600, fontSize: 13 },
};
