import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Flame, PenLine, Trash2 } from "lucide-react";
import { webApi, type WebStatus } from "../../lib/webApi";
import { resolveWebMediaFetchUrl } from "../../lib/webMediaUrl";
import { Avatar, initials, hue } from "./webUiShared";
import { WebStoryBoostModal } from "./WebStoryBoostModal";

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusMediaSrc(url: string | undefined, token: string): string | undefined {
  if (!url) return undefined;
  return resolveWebMediaFetchUrl(url, token);
}

function StatusPreview({ status, token }: { status: WebStatus; token: string }) {
  const src = statusMediaSrc(status.media_url, token);
  if (status.type === "image" && src) {
    return <img src={src} alt="" className="vw-status-detail__media" />;
  }
  if (status.type === "video" && src) {
    return <video src={src} controls className="vw-status-detail__media" />;
  }
  return (
    <div
      className="vw-status-detail__text-card"
      style={{ backgroundColor: status.background_color ?? "#5B4FE8" }}
    >
      <p>{status.content}</p>
    </div>
  );
}

export function WebStatusDetailPane({
  token,
  selfName,
  selfPhone,
  selfAvatar,
  statuses,
  onRefresh,
  onAddStatus,
}: {
  token: string;
  selfName: string;
  selfPhone?: string;
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
  const [boostBadge, setBoostBadge] = useState<string | null>(null);

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

  useEffect(() => {
    if (!active?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await webApi.statusBoostInfo(token, active.id);
        if (!cancelled) setBoostBadge(res.boost?.status ?? null);
      } catch {
        if (!cancelled) setBoostBadge(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, active?.id]);

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
                  <img src={statusMediaSrc(s.media_url, token)} alt="" />
                ) : (
                  <span style={{ backgroundColor: s.background_color ?? "#5B4FE8" }} />
                )}
              </button>
            ))}
          </div>
        ) : null}

        <div className="vw-status-detail__preview-wrap">
          <StatusPreview status={active} token={token} />
        </div>

        <div className="vw-status-detail__boost-row">
          {boostBadge === "active" ? (
            <span className="vw-status-detail__boost-badge vw-status-detail__boost-badge--active">Boost active</span>
          ) : boostBadge === "pending_verification" ? (
            <span className="vw-status-detail__boost-badge">Boost pending</span>
          ) : null}
          <button type="button" className="vw-status-detail__boost-btn" onClick={() => setBoostOpen(true)}>
            <Flame size={16} />
            {boostBadge ? "Manage boost" : "Boost story"}
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

      {boostOpen ? (
        <WebStoryBoostModal
          token={token}
          status={active}
          selfName={selfName}
          selfPhone={selfPhone}
          onClose={() => setBoostOpen(false)}
          onBoosted={() => {
            setBoostBadge("pending_verification");
            onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}
