import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi, fmtDate } from "../adminApi";

const MIN_PREVIEW_SEC = 5;

function requiredPreviewSeconds(durationSeconds: number): number {
  const d = Math.max(0, durationSeconds);
  if (d > 0 && d < MIN_PREVIEW_SEC) return Math.max(2, Math.ceil(d * 0.8));
  return MIN_PREVIEW_SEC;
}

type ReelsStats = {
  channels: number;
  videos: number;
  subscriptions: number;
  total_views: string;
  total_view_hours: string;
  fraud_events_7d: number;
};

type ReelsChannel = {
  id: number;
  user_id: number;
  handle: string;
  owner_name?: string;
  owner_phone?: string;
  subscriber_count: number;
  total_views: string;
  total_view_hours: string;
  total_likes: string;
  total_comments: string;
  total_shares: string;
  fraud_score: string;
  monetization_status: string;
  monetization_eligible: boolean;
  video_count: number;
  created_at: string;
};

type FraudEvent = {
  id: number;
  entity_type: string;
  entity_id: number;
  signal_type: string;
  score_delta: string;
  created_at: string;
};

type ReelsConfig = {
  monetization: {
    minSubscribers: number;
    minWatchHours: number;
    minPublicVideos: number;
    maxFraudScore: number;
    revenueSharePercent: number;
    summary: string[];
  };
  playButton: {
    minWatchSecondsToCountView: number;
    maxFraudScoreForPlay: number;
    summary: string[];
  };
  fraud: { enabled: boolean };
  feed: { summary: string[] };
  notifications: {
    notifySubscribersOnNewVideo: boolean;
    subscribersNotifiedFirst: boolean;
  };
  contentModeration?: {
    enabled: boolean;
    nsfwBlockThreshold: number;
    requireThumbnail: boolean;
    summary: string[];
  };
};

type ModerationVideo = {
  id: number;
  title: string;
  description?: string;
  duration_seconds?: number;
  status: string;
  moderation_status: string;
  moderation_reason?: string;
  nsfw_score: string;
  thumbnail_url?: string;
  video_url?: string;
  preview_stream_url?: string;
  file_on_server?: boolean;
  channel_handle: string;
  user_id: number;
  created_at: string;
};

export function ReelsTab({ onErr }: { onErr: (m: string | null) => void }) {
  const [stats, setStats] = useState<ReelsStats | null>(null);
  const [channels, setChannels] = useState<ReelsChannel[]>([]);
  const [fraudEvents, setFraudEvents] = useState<FraudEvent[]>([]);
  const [config, setConfig] = useState<ReelsConfig | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [moderationQueue, setModerationQueue] = useState<ModerationVideo[]>([]);
  const [subTab, setSubTab] = useState<"channels" | "rules" | "fraud" | "moderation">("channels");
  const [previewVideo, setPreviewVideo] = useState<ModerationVideo | null>(null);
  const [previewReadyIds, setPreviewReadyIds] = useState<Set<number>>(new Set());
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewRequired, setPreviewRequired] = useState(MIN_PREVIEW_SEC);
  const [previewLogging, setPreviewLogging] = useState(false);
  const [previewPlayError, setPreviewPlayError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const maxWatchedRef = useRef(0);
  const previewLoggedRef = useRef(false);

  const load = useCallback(async () => {
    onErr(null);
    const [st, ch, fe, cfg, mq] = await Promise.all([
      adminApi<{ success: boolean; stats: ReelsStats }>("/admin/reels/stats"),
      adminApi<{ success: boolean; channels: ReelsChannel[] }>(
        `/admin/reels/channels?limit=100${search ? `&q=${encodeURIComponent(search)}` : ""}`,
      ),
      adminApi<{ success: boolean; events: FraudEvent[] }>("/admin/reels/fraud-events?limit=50"),
      adminApi<{ success: boolean; config: ReelsConfig }>("/admin/reels/config"),
      adminApi<{ success: boolean; videos: ModerationVideo[] }>("/admin/reels/moderation-queue?limit=80"),
    ]);
    setStats(st.stats);
    setChannels(ch.channels ?? []);
    setFraudEvents(fe.events ?? []);
    setConfig(cfg.config);
    setModerationQueue(mq.videos ?? []);
  }, [search, onErr]);

  useEffect(() => {
    void load().catch((e) => onErr(e instanceof Error ? e.message : "Load failed"));
  }, [load, onErr]);

  const runFraudScan = async () => {
    setBusy(true);
    try {
      const r = await adminApi<{ scanned: number }>("/admin/reels/fraud-scan", { method: "POST" });
      alert(`Fraud scan complete — ${r.scanned} channels reviewed`);
      await load();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  };

  const runModerationScan = async () => {
    setBusy(true);
    try {
      const r = await adminApi<{ processed: number }>("/admin/reels/moderation-scan", { method: "POST" });
      alert(`Moderation scan complete — ${r.processed} videos processed`);
      await load();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  };

  const openPreview = (v: ModerationVideo) => {
    maxWatchedRef.current = 0;
    previewLoggedRef.current = false;
    setPreviewProgress(0);
    setPreviewPlayError(null);
    setPreviewRequired(requiredPreviewSeconds(Number(v.duration_seconds ?? 0)));
    setPreviewVideo(v);
  };

  const previewPlaybackUrl = (v: ModerationVideo) =>
    v.preview_stream_url ?? v.video_url ?? "";

  const closePreview = () => {
    setPreviewVideo(null);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const markPreviewComplete = async (v: ModerationVideo, watchedSeconds: number) => {
    if (previewLoggedRef.current) return;
    previewLoggedRef.current = true;
    setPreviewLogging(true);
    try {
      await adminApi(`/admin/reels/videos/${v.id}/admin-preview`, {
        method: "POST",
        body: JSON.stringify({ watchedSeconds }),
      });
      setPreviewReadyIds((prev) => new Set(prev).add(v.id));
    } catch (e) {
      previewLoggedRef.current = false;
      onErr(e instanceof Error ? e.message : "Preview log failed");
    } finally {
      setPreviewLogging(false);
    }
  };

  const onVideoTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || !previewVideo) return;
    maxWatchedRef.current = Math.max(maxWatchedRef.current, el.currentTime);
    setPreviewProgress(maxWatchedRef.current);
    if (maxWatchedRef.current >= previewRequired) {
      void markPreviewComplete(previewVideo, maxWatchedRef.current);
    }
  };

  const onVideoEnded = () => {
    if (!previewVideo) return;
    const watched = maxWatchedRef.current || videoRef.current?.currentTime || 0;
    if (watched >= previewRequired) {
      void markPreviewComplete(previewVideo, watched);
    }
  };

  const approveVideo = async (id: number, title: string) => {
    if (!previewReadyIds.has(id)) {
      alert("Pehle ▶ Preview se video play karke dekhein, phir approve karein.");
      return;
    }
    if (!window.confirm(`Approve "${title}" and publish publicly?`)) return;
    try {
      await adminApi(`/admin/reels/videos/${id}/approve`, { method: "POST" });
      alert("Video approved — ab sab users dekh sakte hain.");
      setPreviewReadyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await load();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Approve failed — pehle preview complete karein");
    }
  };

  const rejectVideo = async (id: number) => {
    const reason = window.prompt("Rejection reason (optional)") ?? "";
    try {
      await adminApi(`/admin/reels/videos/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      alert("Video rejected.");
      await load();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Reject failed");
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setBusy(true);
    try {
      await adminApi("/admin/reels/config", { method: "PUT", body: JSON.stringify(config) });
      alert("Reels rules saved");
      await load();
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const monetizationBadge = (status: string, eligible: boolean) => {
    if (eligible || status === "eligible") return <span className="badge-pill badge-pill--ok">{status}</span>;
    if (status === "pending") return <span className="badge-pill badge-pill--warn">{status}</span>;
    return <span className="badge-pill badge-pill--muted">{status}</span>;
  };

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <h2 className="admin-page__title">Video / Reels Platform</h2>
        <p className="admin-page__sub">
          YouTube-style channels, monetization rules, fraud detection, NSFW moderation, and subscriber notifications.
        </p>
      </header>

      {stats ? (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-val">{stats.channels}</div>
            <div className="stat-label">Channels</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{stats.videos}</div>
            <div className="stat-label">Videos</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{stats.subscriptions}</div>
            <div className="stat-label">Subscriptions</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{Number(stats.total_views).toLocaleString()}</div>
            <div className="stat-label">Total views</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{Number(stats.total_view_hours).toLocaleString()}h</div>
            <div className="stat-label">Watch hours</div>
          </div>
          <div className={`stat-card${stats.fraud_events_7d > 0 ? " stat-card--warn" : ""}`}>
            <div className="stat-val">{stats.fraud_events_7d}</div>
            <div className="stat-label">Fraud signals (7d)</div>
          </div>
          {moderationQueue.length > 0 ? (
            <div className="stat-card stat-card--warn">
              <div className="stat-val">{moderationQueue.length}</div>
              <div className="stat-label">Pending NSFW review</div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="muted">Loading platform stats…</p>
      )}

      <div className="admin-toolbar">
        <div className="admin-segment">
          <button type="button" className={subTab === "channels" ? "active" : ""} onClick={() => setSubTab("channels")}>
            Channels
          </button>
          <button type="button" className={subTab === "rules" ? "active" : ""} onClick={() => setSubTab("rules")}>
            Rules
          </button>
          <button type="button" className={subTab === "fraud" ? "active" : ""} onClick={() => setSubTab("fraud")}>
            Fraud
          </button>
          <button type="button" className={subTab === "moderation" ? "active" : ""} onClick={() => setSubTab("moderation")}>
            NSFW queue{moderationQueue.length > 0 ? ` (${moderationQueue.length})` : ""}
          </button>
        </div>
        <div className="admin-toolbar__actions">
          <button type="button" className="btn-sm" disabled={busy} onClick={runFraudScan}>
            Run fraud scan
          </button>
          <button type="button" className="btn-sm btn-sm-primary" disabled={busy} onClick={runModerationScan}>
            Run NSFW scan
          </button>
        </div>
      </div>

      {subTab === "channels" ? (
        <div className="admin-card">
          <div className="admin-card__toolbar">
            <input
              className="search-input"
              placeholder="Search handle, user id, owner name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
            />
            <button type="button" className="btn-sm btn-sm-primary" onClick={() => void load()}>
              Search
            </button>
            <span className="dev-count">{channels.length} channels</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>User ID</th>
                  <th>Subs</th>
                  <th>Views</th>
                  <th>Watch h</th>
                  <th>Likes</th>
                  <th>Comments</th>
                  <th>Shares</th>
                  <th>Fraud</th>
                  <th>Monetization</th>
                  <th>Videos</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                  <tr key={c.id}>
                    <td className="channel-cell">
                      <strong>@{c.handle}</strong>
                      <div className="muted">{c.owner_name ?? "—"}</div>
                    </td>
                    <td>{c.user_id}</td>
                    <td>{c.subscriber_count.toLocaleString()}</td>
                    <td>{Number(c.total_views).toLocaleString()}</td>
                    <td>{Number(c.total_view_hours).toFixed(1)}</td>
                    <td>{Number(c.total_likes).toLocaleString()}</td>
                    <td>{Number(c.total_comments).toLocaleString()}</td>
                    <td>{Number(c.total_shares).toLocaleString()}</td>
                    <td>{Number(c.fraud_score).toFixed(1)}</td>
                    <td>{monetizationBadge(c.monetization_status, c.monetization_eligible)}</td>
                    <td>{c.video_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {channels.length === 0 ? <p className="admin-empty">No channels match your search.</p> : null}
          </div>
        </div>
      ) : null}

      {subTab === "rules" && config ? (
        <div className="admin-card admin-rules" style={{ padding: "18px 20px" }}>
          <h3>Monetization (YouTube Partner style)</h3>
          <label>
            Min subscribers
            <input
              type="number"
              value={config.monetization.minSubscribers}
              onChange={(e) => setConfig({ ...config, monetization: { ...config.monetization, minSubscribers: Number(e.target.value) } })}
            />
          </label>
          <label style={{ marginTop: 10 }}>
            Min watch hours
            <input
              type="number"
              value={config.monetization.minWatchHours}
              onChange={(e) => setConfig({ ...config, monetization: { ...config.monetization, minWatchHours: Number(e.target.value) } })}
            />
          </label>
          <label style={{ marginTop: 10 }}>
            Revenue share %
            <input
              type="number"
              value={config.monetization.revenueSharePercent}
              onChange={(e) => setConfig({ ...config, monetization: { ...config.monetization, revenueSharePercent: Number(e.target.value) } })}
            />
          </label>

          <h3>Play button / view counting</h3>
          <label>
            Min seconds to count a view
            <input
              type="number"
              value={config.playButton.minWatchSecondsToCountView}
              onChange={(e) => setConfig({ ...config, playButton: { ...config.playButton, minWatchSecondsToCountView: Number(e.target.value) } })}
            />
          </label>
          <label style={{ marginTop: 10 }}>
            Max fraud score for play
            <input
              type="number"
              value={config.playButton.maxFraudScoreForPlay}
              onChange={(e) => setConfig({ ...config, playButton: { ...config.playButton, maxFraudScoreForPlay: Number(e.target.value) } })}
            />
          </label>

          <h3>NSFW / content safety</h3>
          <label>
            <input
              type="checkbox"
              checked={config.contentModeration?.enabled ?? true}
              onChange={(e) => setConfig({
                ...config,
                contentModeration: {
                  ...config.contentModeration!,
                  enabled: e.target.checked,
                  nsfwBlockThreshold: config.contentModeration?.nsfwBlockThreshold ?? 0.55,
                  requireThumbnail: config.contentModeration?.requireThumbnail ?? true,
                  summary: config.contentModeration?.summary ?? [],
                },
              })}
            />
            Auto-scan videos before publish
          </label>
          <label style={{ marginTop: 10 }}>
            Block threshold (0–1)
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={config.contentModeration?.nsfwBlockThreshold ?? 0.55}
              onChange={(e) => setConfig({
                ...config,
                contentModeration: {
                  ...config.contentModeration!,
                  enabled: config.contentModeration?.enabled ?? true,
                  nsfwBlockThreshold: Number(e.target.value),
                  requireThumbnail: config.contentModeration?.requireThumbnail ?? true,
                  summary: config.contentModeration?.summary ?? [],
                },
              })}
            />
          </label>
          <p className="muted" style={{ marginTop: 10 }}>
            Set GOOGLE_VISION_API_KEY and/or SIGHTENGINE credentials on the API server for AI vision scans.
          </p>

          <h3>Notifications</h3>
          <label>
            <input
              type="checkbox"
              checked={config.notifications.notifySubscribersOnNewVideo}
              onChange={(e) => setConfig({ ...config, notifications: { ...config.notifications, notifySubscribersOnNewVideo: e.target.checked } })}
            />
            Notify subscribers on new video
          </label>
          <label style={{ marginTop: 10 }}>
            <input
              type="checkbox"
              checked={config.notifications.subscribersNotifiedFirst}
              onChange={(e) => setConfig({ ...config, notifications: { ...config.notifications, subscribersNotifiedFirst: e.target.checked } })}
            />
            Subscribers see new videos first in feed
          </label>

          <div style={{ marginTop: 22, display: "flex", gap: 10, alignItems: "center" }}>
            <button type="button" className="primary-btn" disabled={busy} onClick={saveConfig}>
              Save rules
            </button>
            <span className="muted">Shown on creator profiles in the mobile app.</span>
          </div>
        </div>
      ) : null}

      {subTab === "moderation" ? (
        <>
          <div className="admin-alert">
            <strong>Manual approval — pehle video dekho, phir approve</strong>
            <p>
              Har pending video par <strong>Preview</strong> dabao, kam se kam {MIN_PREVIEW_SEC}s dekho.
              Uske baad hi <strong>Approve</strong> active hoga.
            </p>
          </div>
          <div className="admin-card">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Video</th>
                    <th>Channel</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {moderationQueue.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <strong>{v.title}</strong>
                        <div className="muted">#{v.id}</div>
                      </td>
                      <td>@{v.channel_handle}</td>
                      <td>{v.duration_seconds ? `${v.duration_seconds}s` : "—"}</td>
                      <td><span className="badge-pill badge-pill--warn">{v.moderation_status || v.status}</span></td>
                      <td style={{ maxWidth: 220 }}>{v.moderation_reason ?? "—"}</td>
                      <td>
                        <div className="action-btns">
                          <button type="button" className="btn-sm" onClick={() => openPreview(v)}>Preview</button>
                          <button
                            type="button"
                            className="btn-sm btn-sm-primary"
                            disabled={!previewReadyIds.has(v.id)}
                            title={previewReadyIds.has(v.id) ? "Approve & publish" : "Pehle Preview se video dekhein"}
                            onClick={() => void approveVideo(v.id, v.title)}
                          >
                            Approve
                          </button>
                          <button type="button" className="btn-sm btn-sm-danger" onClick={() => void rejectVideo(v.id)}>
                            Reject
                          </button>
                          {previewReadyIds.has(v.id) ? <span className="preview-ready">✓ previewed</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {moderationQueue.length === 0 ? (
                <p className="admin-empty">Koi pending video nahi — queue khali hai.</p>
              ) : null}
            </div>
          </div>
          {previewVideo ? (
            <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={closePreview}>
              <div className="modal-card story-preview-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <div>
                    <h3>{previewVideo.title}</h3>
                    <p className="muted">@{previewVideo.channel_handle} · #{previewVideo.id}</p>
                  </div>
                  <button type="button" className="btn btn-ghost modal-close" onClick={closePreview}>
                    Close
                  </button>
                </div>
                {previewPlaybackUrl(previewVideo) ? (
                  <>
                    <p className="muted" style={{ marginTop: 0 }}>
                      Step 1: Play the video below. Step 2: Watch at least <strong>{previewRequired}s</strong> to unlock Approve.
                    </p>
                    {previewVideo.file_on_server === false ? (
                      <p className="err" style={{ marginTop: 8 }}>
                        Video file missing on server — ask user to re-upload or reject.
                      </p>
                    ) : null}
                    <video
                      key={previewVideo.id}
                      ref={videoRef}
                      src={previewPlaybackUrl(previewVideo)}
                      controls
                      playsInline
                      preload="metadata"
                      className="story-preview-media"
                      onTimeUpdate={onVideoTimeUpdate}
                      onEnded={onVideoEnded}
                      onError={() => {
                        setPreviewPlayError("Video load failed — redeploy API or check file on disk.");
                      }}
                      poster={previewVideo.thumbnail_url}
                    />
                    {previewPlayError ? <p className="err" style={{ marginTop: 8 }}>{previewPlayError}</p> : null}
                    {previewVideo.video_url ? (
                      <p style={{ marginTop: 8, fontSize: 12 }}>
                        <a href={previewPlaybackUrl(previewVideo)} target="_blank" rel="noreferrer">
                          Open video in new tab
                        </a>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="err" style={{ marginTop: 16 }}>Video URL missing.</p>
                )}
                <p style={{ marginTop: 12 }}>
                  Progress: <strong>{previewProgress.toFixed(1)}s</strong> / {previewRequired}s
                  {previewReadyIds.has(previewVideo.id) ? " — ready to approve" : previewLogging ? " — saving…" : ""}
                </p>
                {previewVideo.description ? (
                  <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{previewVideo.description}</p>
                ) : null}
                <div className="dev-actions" style={{ padding: 0, background: "transparent", marginTop: 16 }}>
                  <div className="dev-actions__group">
                    <button
                      type="button"
                      className="btn-sm btn-sm-primary"
                      disabled={!previewReadyIds.has(previewVideo.id)}
                      onClick={() => void approveVideo(previewVideo.id, previewVideo.title)}
                    >
                      Approve after preview
                    </button>
                    <button type="button" className="btn-sm btn-sm-danger" onClick={() => void rejectVideo(previewVideo.id)}>
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {subTab === "fraud" ? (
        <div className="admin-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Entity</th>
                  <th>Signal</th>
                  <th>Score +</th>
                </tr>
              </thead>
              <tbody>
                {fraudEvents.map((e) => (
                  <tr key={e.id}>
                    <td>{fmtDate(e.created_at)}</td>
                    <td>{e.entity_type} #{e.entity_id}</td>
                    <td>{e.signal_type}</td>
                    <td>+{e.score_delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {fraudEvents.length === 0 ? <p className="admin-empty">No fraud events in the last 7 days.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
