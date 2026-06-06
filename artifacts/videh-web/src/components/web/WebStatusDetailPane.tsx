import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Flame, PenLine, Trash2, X, Zap } from "lucide-react";
import { webApi, type WebStatus } from "../../lib/webApi";
import { Avatar, initials, hue } from "./webUiShared";

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPreview({ status }: { status: WebStatus }) {
  if (status.type === "image" && status.media_url) {
    return <img src={status.media_url} alt="" className="vw-status-detail__media" />;
  }
  if (status.type === "video" && status.media_url) {
    return <video src={status.media_url} controls className="vw-status-detail__media" />;
  }
  return (
    <div
      className="vw-status-detail__text-card"
      style={{ backgroundColor: status.background_color ?? "#00A884" }}
    >
      <p>{status.content}</p>
    </div>
  );
}

function BoostModal({
  status,
  onClose,
}: {
  status: WebStatus;
  onClose: () => void;
}) {
  const [durationDays, setDurationDays] = useState("3");
  const [radiusKm, setRadiusKm] = useState("25");
  const [targetCity, setTargetCity] = useState("");
  const [targetState, setTargetState] = useState("");
  const [plan, setPlan] = useState<{ amountInr: number; estimatedReach: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const days = Math.min(30, Math.max(1, Number(durationDays) || 3));
        const radius = Math.min(500, Math.max(5, Number(radiusKm) || 25));
        const res = await webApi.statusBoostQuote({
          durationDays: days,
          radiusKm: radius,
          targetCity,
          targetState,
        });
        if (!cancelled) setPlan({ amountInr: res.plan.amountInr, estimatedReach: res.plan.estimatedReach });
      } catch {
        if (!cancelled) setPlan(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(load, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [durationDays, radiusKm, targetCity, targetState]);

  return (
    <div className="vw-status-compose-overlay" onClick={onClose}>
      <div className="vw-status-boost-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vw-status-boost-modal__head">
          <h3>Boost story</h3>
          <button type="button" className="vw-status-compose__close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <p className="vw-status-boost-modal__hint">
          Reach more people near your target area. Payment and verification work the same as the Videh mobile app.
        </p>
        <div className="vw-status-boost-modal__grid">
          <label>
            Duration (days)
            <input type="number" min={1} max={30} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
          </label>
          <label>
            Radius (km)
            <input type="number" min={5} max={500} value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} />
          </label>
          <label>
            Target city (optional)
            <input value={targetCity} onChange={(e) => setTargetCity(e.target.value)} placeholder="e.g. Patna" />
          </label>
          <label>
            Target state (optional)
            <input value={targetState} onChange={(e) => setTargetState(e.target.value)} placeholder="e.g. Bihar" />
          </label>
        </div>
        {loading ? (
          <p className="vw-status-boost-modal__price">Calculating…</p>
        ) : plan ? (
          <div className="vw-status-boost-modal__summary">
            <div><strong>₹{plan.amountInr.toLocaleString("en-IN")}</strong> estimated</div>
            <div>~{plan.estimatedReach.toLocaleString("en-IN")} reach</div>
          </div>
        ) : null}
        <button
          type="button"
          className="vw-status-compose__post"
          onClick={() => {
            alert(
              `To complete payment for status #${status.id}, open Videh app → Status → My status → Boost story.\n\nYour plan settings are saved here on web for reference.`,
            );
            onClose();
          }}
        >
          <Zap size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Complete boost in Videh app
        </button>
      </div>
    </div>
  );
}

export function WebStatusDetailPane({
  token,
  selfName,
  selfAvatar,
  statuses,
  onRefresh,
  onAddStatus,
}: {
  token: string;
  selfName: string;
  selfAvatar?: string;
  statuses: WebStatus[];
  onRefresh: () => void;
  onAddStatus: () => void;
}) {
  const sorted = useMemo(
    () => [...statuses].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [statuses],
  );
  const [activeId, setActiveId] = useState(sorted[0]?.id ?? null);
  const [viewers, setViewers] = useState<Array<{ id: number; name: string; avatar?: string; viewed_at: string; reaction?: string }>>([]);
  const [viewCount, setViewCount] = useState(0);
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);

  const active = sorted.find((s) => s.id === activeId) ?? sorted[0];

  useEffect(() => {
    if (sorted.length > 0 && (activeId == null || !sorted.some((s) => s.id === activeId))) {
      setActiveId(sorted[0].id);
    }
  }, [sorted, activeId]);

  const loadViewers = useCallback(async (statusId: number) => {
    setLoadingViewers(true);
    try {
      const res = await webApi.statusViewers(token, statusId);
      setViewers(res.viewers);
      setViewCount(res.viewCount);
      setReactions(res.reactions);
    } catch {
      setViewers([]);
      setViewCount(0);
      setReactions({});
    } finally {
      setLoadingViewers(false);
    }
  }, [token]);

  useEffect(() => {
    if (active?.id) void loadViewers(active.id);
  }, [active?.id, loadViewers]);

  const deleteActive = async () => {
    if (!active || deleting) return;
    if (!confirm("Delete this status update?")) return;
    setDeleting(true);
    try {
      await webApi.deleteStatus(token, active.id);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete status.");
    } finally {
      setDeleting(false);
    }
  };

  if (!active) {
    return (
      <div className="vw-status-detail vw-status-detail--empty">
        <p>No active status. Add one from the left panel.</p>
        <button type="button" className="vw-status-panel__empty-btn" onClick={onAddStatus}>
          Add status
        </button>
      </div>
    );
  }

  const reactionEntries = Object.entries(reactions);

  return (
    <div className="vw-status-detail">
      <header className="vw-status-detail__header">
        <div className="vw-status-detail__profile">
          <Avatar name={selfName} url={selfAvatar} size={40} />
          <div>
            <div className="vw-status-detail__name">My status</div>
            <div className="vw-status-detail__time">{formatWhen(active.created_at)}</div>
          </div>
        </div>
        <div className="vw-status-detail__actions">
          <button type="button" className="vw-status-detail__icon-btn" title="Add status" onClick={onAddStatus}>
            <PenLine size={18} />
          </button>
          <button
            type="button"
            className="vw-status-detail__icon-btn vw-status-detail__icon-btn--danger"
            title="Delete status"
            disabled={deleting}
            onClick={() => void deleteActive()}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </header>

      <div className="vw-status-detail__body">
        {sorted.length > 1 ? (
          <div className="vw-status-detail__thumbs">
            {sorted.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`vw-status-detail__thumb${s.id === active.id ? " vw-status-detail__thumb--active" : ""}`}
                onClick={() => setActiveId(s.id)}
              >
                {s.type === "image" && s.media_url ? (
                  <img src={s.media_url} alt="" />
                ) : (
                  <span style={{ backgroundColor: s.background_color ?? "#00A884" }} />
                )}
              </button>
            ))}
          </div>
        ) : null}

        <div className="vw-status-detail__preview-wrap">
          <StatusPreview status={active} />
        </div>

        <div className="vw-status-detail__boost-row">
          <button type="button" className="vw-status-detail__boost-btn" onClick={() => setBoostOpen(true)}>
            <Flame size={16} />
            Boost story
          </button>
        </div>

        <section className="vw-status-detail__viewers">
          <div className="vw-status-detail__viewers-head">
            <Eye size={18} />
            <span>
              Viewed by <strong>{viewCount}</strong>
            </span>
            <button type="button" className="vw-status-detail__refresh" onClick={() => void loadViewers(active.id)}>
              Refresh
            </button>
          </div>

          {reactionEntries.length > 0 ? (
            <div className="vw-status-detail__reactions">
              {reactionEntries.map(([emoji, count]) => (
                <span key={emoji} className="vw-status-detail__reaction-chip">
                  {emoji} {count}
                </span>
              ))}
            </div>
          ) : null}

          {loadingViewers ? (
            <p className="vw-status-detail__muted">Loading viewers…</p>
          ) : viewers.length === 0 ? (
            <p className="vw-status-detail__muted">No views yet. Views appear when contacts open your status.</p>
          ) : (
            <ul className="vw-status-detail__viewer-list">
              {viewers.map((v) => (
                <li key={v.id} className="vw-status-detail__viewer">
                  {v.avatar ? (
                    <img src={v.avatar} alt={v.name} className="vw-status-detail__viewer-avatar" />
                  ) : (
                    <div
                      className="vw-status-detail__viewer-avatar"
                      style={{ backgroundColor: `hsl(${hue(v.name)},50%,45%)`, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}
                    >
                      {initials(v.name)}
                    </div>
                  )}
                  <div className="vw-status-detail__viewer-meta">
                    <span className="vw-status-detail__viewer-name">
                      {v.name}
                      {v.reaction ? <span className="vw-status-detail__viewer-react">{v.reaction}</span> : null}
                    </span>
                    <span className="vw-status-detail__viewer-time">{formatWhen(v.viewed_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {boostOpen ? <BoostModal status={active} onClose={() => setBoostOpen(false)} /> : null}
    </div>
  );
}
