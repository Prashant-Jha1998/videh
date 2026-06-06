import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import { webApi, type WebStatus } from "../../lib/webApi";
import { openRazorpayCheckout } from "../../lib/razorpayWeb";

type BoostGoal = "views" | "reach" | "local";
type AudienceMode = "auto" | "custom";

const DURATION_PRESETS = [1, 3, 7, 14, 30] as const;

const GOALS: Array<{ id: BoostGoal; title: string; desc: string; icon: typeof TrendingUp }> = [
  { id: "views", title: "More story views", desc: "Show your status to more people in your area", icon: TrendingUp },
  { id: "reach", title: "Reach new people", desc: "Expand beyond your usual contacts", icon: Users },
  { id: "local", title: "Local awareness", desc: "Target a city or state for maximum visibility", icon: MapPin },
];

function formatInr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function boostStatusLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "pending_verification") return "Pending verification";
  if (status === "rejected") return "Rejected";
  return status;
}

export function WebStoryBoostModal({
  token,
  status,
  selfName,
  selfPhone,
  onClose,
  onBoosted,
}: {
  token: string;
  status: WebStatus;
  selfName: string;
  selfPhone?: string;
  onClose: () => void;
  onBoosted?: () => void;
}) {
  const [step, setStep] = useState<"setup" | "review" | "success" | "analytics">("setup");
  const [goal, setGoal] = useState<BoostGoal>("views");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("auto");
  const [durationDays, setDurationDays] = useState(3);
  const [radiusKm, setRadiusKm] = useState(25);
  const [targetCity, setTargetCity] = useState("");
  const [targetState, setTargetState] = useState("");
  const [plan, setPlan] = useState<{
    amountInr: number;
    durationDays: number;
    radiusKm: number;
    estimatedReach: number;
  } | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [existingBoost, setExistingBoost] = useState<Awaited<ReturnType<typeof webApi.statusBoostInfo>>["boost"]>(null);
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof webApi.statusBoostAnalytics>> | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    if (goal === "local") {
      setAudienceMode("custom");
    }
  }, [goal]);

  const planInput = useMemo(() => {
    const city = audienceMode === "custom" ? targetCity : "";
    const state = audienceMode === "custom" ? targetState : "";
    return { durationDays, radiusKm, targetCity: city, targetState: state };
  }, [audienceMode, durationDays, radiusKm, targetCity, targetState]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setQuoteLoading(true);
      try {
        const res = await webApi.statusBoostQuote(planInput);
        if (!cancelled) setPlan(res.plan);
      } catch {
        if (!cancelled) setPlan(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    };
    const t = setTimeout(load, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [planInput]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await webApi.statusBoostInfo(token, status.id);
        if (!cancelled) setExistingBoost(res.boost);
      } catch {
        if (!cancelled) setExistingBoost(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, status.id]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await webApi.statusBoostAnalytics(token, status.id);
      setAnalytics(res);
      setStep("analytics");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load analytics.");
    } finally {
      setAnalyticsLoading(false);
    }
  }, [token, status.id]);

  const costBreakdown = useMemo(() => {
    if (!plan) return null;
    const base = 499;
    const daysCost = plan.durationDays * 299;
    const radiusCost = plan.radiusKm * 12;
    const cityCost = planInput.targetCity?.trim() ? 350 : 0;
    const stateCost = planInput.targetState?.trim() ? 700 : 0;
    return { base, daysCost, radiusCost, cityCost, stateCost };
  }, [plan, planInput]);

  const estimatedImpressions = plan ? Math.round(plan.estimatedReach * 1.35) : 0;
  const estimatedProfileVisits = plan ? Math.round(plan.estimatedReach * 0.08) : 0;

  const payAndBoost = async () => {
    if (!plan || paying) return;
    setPaying(true);
    setError(null);
    try {
      const orderRes = await webApi.statusBoostOrder(token, status.id, planInput);
      const payment = await openRazorpayCheckout({
        keyId: orderRes.keyId,
        orderId: orderRes.order.id,
        amountPaise: orderRes.order.amount,
        name: "Videh",
        description: `Story boost · ${plan.durationDays} days`,
        prefill: { name: selfName, contact: selfPhone },
      });
      const confirmRes = await webApi.statusBoostConfirm(token, status.id, {
        amountInr: plan.amountInr,
        durationDays: plan.durationDays,
        radiusKm: plan.radiusKm,
        targetCity: planInput.targetCity,
        targetState: planInput.targetState,
        razorpayOrderId: payment.razorpay_order_id,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature,
      });
      setSuccessMessage(confirmRes.message);
      setExistingBoost(confirmRes.boost as typeof existingBoost);
      setStep("success");
      onBoosted?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment failed.";
      if (msg !== "Payment cancelled") setError(msg);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="vw-status-compose-overlay" onClick={onClose}>
      <div className="vw-story-boost" onClick={(e) => e.stopPropagation()}>
        <header className="vw-story-boost__head">
          <div>
            <h3>Boost story</h3>
            <p>Promote your status like Instagram reels — pay securely with Razorpay.</p>
          </div>
          <button type="button" className="vw-status-compose__close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        {existingBoost && step !== "success" ? (
          <div className="vw-story-boost__existing">
            <Sparkles size={16} />
            <span>
              Latest boost: <strong>{boostStatusLabel(existingBoost.status)}</strong>
              {existingBoost.status === "pending_verification" ? " — admin review within 24h" : null}
            </span>
            {(existingBoost.status === "active" || existingBoost.status === "pending_verification") && (
              <button type="button" className="vw-story-boost__link" onClick={() => void loadAnalytics()} disabled={analyticsLoading}>
                View results
              </button>
            )}
          </div>
        ) : null}

        {step === "setup" ? (
          <div className="vw-story-boost__body">
            <section className="vw-story-boost__section">
              <h4>
                <Target size={16} /> Goal
              </h4>
              <div className="vw-story-boost__goals">
                {GOALS.map((g) => {
                  const Icon = g.icon;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className={`vw-story-boost__goal${goal === g.id ? " vw-story-boost__goal--active" : ""}`}
                      onClick={() => setGoal(g.id)}
                    >
                      <Icon size={18} />
                      <div>
                        <strong>{g.title}</strong>
                        <span>{g.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="vw-story-boost__section">
              <h4>
                <Users size={16} /> Audience
              </h4>
              <div className="vw-story-boost__audience-tabs">
                <button
                  type="button"
                  className={audienceMode === "auto" ? "vw-story-boost__tab--active" : ""}
                  onClick={() => setAudienceMode("auto")}
                >
                  Automatic
                </button>
                <button
                  type="button"
                  className={audienceMode === "custom" ? "vw-story-boost__tab--active" : ""}
                  onClick={() => setAudienceMode("custom")}
                >
                  Custom location
                </button>
              </div>
              {audienceMode === "auto" ? (
                <p className="vw-story-boost__hint">Videh shows your story to people near you and in your contact network.</p>
              ) : (
                <div className="vw-story-boost__location">
                  <label>
                    Radius (km)
                    <input
                      type="range"
                      min={5}
                      max={500}
                      value={radiusKm}
                      onChange={(e) => setRadiusKm(Number(e.target.value))}
                    />
                    <span className="vw-story-boost__range-val">{radiusKm} km</span>
                  </label>
                  <div className="vw-story-boost__location-grid">
                    <label>
                      Target city
                      <input value={targetCity} onChange={(e) => setTargetCity(e.target.value)} placeholder="e.g. Patna" />
                    </label>
                    <label>
                      Target state
                      <input value={targetState} onChange={(e) => setTargetState(e.target.value)} placeholder="e.g. Bihar" />
                    </label>
                  </div>
                </div>
              )}
            </section>

            <section className="vw-story-boost__section">
              <h4>
                <Clock size={16} /> Duration
              </h4>
              <div className="vw-story-boost__chips">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`vw-story-boost__chip${durationDays === d ? " vw-story-boost__chip--active" : ""}`}
                    onClick={() => setDurationDays(d)}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </section>

            <section className="vw-story-boost__estimates">
              <div className="vw-story-boost__estimate-card">
                <span>Estimated reach</span>
                <strong>{quoteLoading ? "…" : plan ? `~${plan.estimatedReach.toLocaleString("en-IN")}` : "—"}</strong>
              </div>
              <div className="vw-story-boost__estimate-card">
                <span>Impressions</span>
                <strong>{quoteLoading ? "…" : plan ? `~${estimatedImpressions.toLocaleString("en-IN")}` : "—"}</strong>
              </div>
              <div className="vw-story-boost__estimate-card">
                <span>Profile visits</span>
                <strong>{quoteLoading ? "…" : plan ? `~${estimatedProfileVisits.toLocaleString("en-IN")}` : "—"}</strong>
              </div>
            </section>
          </div>
        ) : null}

        {step === "review" ? (
          <div className="vw-story-boost__body">
            <section className="vw-story-boost__review">
              <h4>Review your boost</h4>
              <ul>
                <li>
                  <span>Goal</span>
                  <strong>{GOALS.find((g) => g.id === goal)?.title}</strong>
                </li>
                <li>
                  <span>Duration</span>
                  <strong>{durationDays} days</strong>
                </li>
                <li>
                  <span>Radius</span>
                  <strong>{radiusKm} km</strong>
                </li>
                {planInput.targetCity ? (
                  <li>
                    <span>City</span>
                    <strong>{planInput.targetCity}</strong>
                  </li>
                ) : null}
                {planInput.targetState ? (
                  <li>
                    <span>State</span>
                    <strong>{planInput.targetState}</strong>
                  </li>
                ) : null}
                <li>
                  <span>Estimated reach</span>
                  <strong>~{plan?.estimatedReach.toLocaleString("en-IN") ?? "—"}</strong>
                </li>
              </ul>
              {costBreakdown ? (
                <div className="vw-story-boost__breakdown">
                  <div><span>Base</span><span>{formatInr(costBreakdown.base)}</span></div>
                  <div><span>Duration ({durationDays}d)</span><span>{formatInr(costBreakdown.daysCost)}</span></div>
                  <div><span>Radius ({radiusKm} km)</span><span>{formatInr(costBreakdown.radiusCost)}</span></div>
                  {costBreakdown.cityCost > 0 ? <div><span>City targeting</span><span>{formatInr(costBreakdown.cityCost)}</span></div> : null}
                  {costBreakdown.stateCost > 0 ? <div><span>State targeting</span><span>{formatInr(costBreakdown.stateCost)}</span></div> : null}
                  <div className="vw-story-boost__breakdown-total">
                    <span>Total</span>
                    <span>{plan ? formatInr(plan.amountInr) : "—"}</span>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {step === "success" ? (
          <div className="vw-story-boost__success">
            <CheckCircle2 size={48} className="vw-story-boost__success-icon" />
            <h4>Payment successful</h4>
            <p>{successMessage ?? "Your boost is submitted for verification."}</p>
            <button type="button" className="vw-story-boost__secondary" onClick={() => void loadAnalytics()}>
              <BarChart3 size={16} /> View boost analytics
            </button>
          </div>
        ) : null}

        {step === "analytics" && analytics ? (
          <div className="vw-story-boost__body">
            <section className="vw-story-boost__analytics">
              <h4>
                <BarChart3 size={16} /> Boost performance
              </h4>
              <div className="vw-story-boost__analytics-stats">
                <div>
                  <span>Views during boost</span>
                  <strong>{analytics.boostedViewCount}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{boostStatusLabel(String(analytics.boost.status ?? ""))}</strong>
                </div>
                <div>
                  <span>Amount paid</span>
                  <strong>{formatInr(Number(analytics.boost.amount_inr ?? 0))}</strong>
                </div>
              </div>
              {analytics.viewers.length > 0 ? (
                <ul className="vw-story-boost__analytics-list">
                  {analytics.viewers.slice(0, 20).map((v) => (
                    <li key={v.id}>
                      <span>{v.name}</span>
                      <span>{new Date(v.viewedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="vw-story-boost__hint">No boosted views recorded yet. Check back after your boost goes live.</p>
              )}
            </section>
          </div>
        ) : null}

        {error ? <p className="vw-story-boost__error">{error}</p> : null}

        {step !== "success" && step !== "analytics" ? (
          <footer className="vw-story-boost__foot">
            <div className="vw-story-boost__price">
              {quoteLoading ? (
                <span>Calculating…</span>
              ) : plan ? (
                <>
                  <strong>{formatInr(plan.amountInr)}</strong>
                  <span>total · {durationDays} days</span>
                </>
              ) : (
                <span>Could not calculate price</span>
              )}
            </div>
            {step === "setup" ? (
              <button
                type="button"
                className="vw-story-boost__cta"
                disabled={!plan || quoteLoading}
                onClick={() => setStep("review")}
              >
                Continue <ChevronRight size={16} />
              </button>
            ) : (
              <div className="vw-story-boost__review-actions">
                <button type="button" className="vw-story-boost__secondary" onClick={() => setStep("setup")}>
                  Back
                </button>
                <button
                  type="button"
                  className="vw-story-boost__cta"
                  disabled={!plan || paying}
                  onClick={() => void payAndBoost()}
                >
                  <Zap size={16} />
                  {paying ? "Opening payment…" : `Pay ${plan ? formatInr(plan.amountInr) : ""} & boost`}
                </button>
              </div>
            )}
          </footer>
        ) : (
          <footer className="vw-story-boost__foot vw-story-boost__foot--single">
            <button type="button" className="vw-story-boost__cta" onClick={onClose}>
              Done
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
