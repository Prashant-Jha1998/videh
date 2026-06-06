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

  return (
    <div className="tab-panel">
      <h2>Video / Reels Platform</h2>
      <p className="muted">YouTube-style channels, monetization rules, fraud detection, and subscriber notifications.</p>

      {stats ? (
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-val">{stats.channels}</div><div className="stat-label">Channels</div></div>
          <div className="stat-card"><div className="stat-val">{stats.videos}</div><div className="stat-label">Videos</div></div>
          <div className="stat-card"><div className="stat-val">{stats.subscriptions}</div><div className="stat-label">Subscriptions</div></div>
          <div className="stat-card"><div className="stat-val">{Number(stats.total_views).toLocaleString()}</div><div className="stat-label">Total views</div></div>
          <div className="stat-card"><div className="stat-val">{Number(stats.total_view_hours).toFixed(0)}h</div><div className="stat-label">Watch hours</div></div>
          <div className="stat-card"><div className="stat-val">{stats.fraud_events_7d}</div><div className="stat-label">Fraud signals (7d)</div></div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" className={subTab === "channels" ? "nav-btn active" : "nav-btn"} onClick={() => setSubTab("channels")}>Channels</button>
        <button type="button" className={subTab === "rules" ? "nav-btn active" : "nav-btn"} onClick={() => setSubTab("rules")}>Rules</button>
        <button type="button" className={subTab === "fraud" ? "nav-btn active" : "nav-btn"} onClick={() => setSubTab("fraud")}>Fraud</button>
        <button type="button" className={subTab === "moderation" ? "nav-btn active" : "nav-btn"} onClick={() => setSubTab("moderation")}>
          NSFW queue{moderationQueue.length > 0 ? ` (${moderationQueue.length})` : ""}
        </button>
        <button type="button" className="primary-btn" disabled={busy} onClick={runFraudScan}>Run fraud scan</button>
        <button type="button" className="primary-btn" disabled={busy} onClick={runModerationScan}>Run NSFW scan</button>
      </div>

      {subTab === "channels" ? (
        <>
          <input
            className="search-input"
            placeholder="Search handle, user id, name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            style={{ marginBottom: 12, width: "100%", maxWidth: 400 }}
          />
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
                    <td>
                      <strong>@{c.handle}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{c.owner_name ?? "—"}</div>
                    </td>
                    <td>{c.user_id}</td>
                    <td>{c.subscriber_count}</td>
                    <td>{Number(c.total_views).toLocaleString()}</td>
                    <td>{Number(c.total_view_hours).toFixed(1)}</td>
                    <td>{Number(c.total_likes).toLocaleString()}</td>
                    <td>{Number(c.total_comments).toLocaleString()}</td>
                    <td>{Number(c.total_shares).toLocaleString()}</td>
                    <td>{Number(c.fraud_score).toFixed(1)}</td>
                    <td>{c.monetization_status}</td>
                    <td>{c.video_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {subTab === "rules" && config ? (
        <div style={{ maxWidth: 720 }}>
          <h3>Monetization (YouTube Partner style)</h3>
          <label>Min subscribers <input type="number" value={config.monetization.minSubscribers} onChange={(e) => setConfig({ ...config, monetization: { ...config.monetization, minSubscribers: Number(e.target.value) } })} /></label>
          <label style={{ display: "block", marginTop: 8 }}>Min watch hours <input type="number" value={config.monetization.minWatchHours} onChange={(e) => setConfig({ ...config, monetization: { ...config.monetization, minWatchHours: Number(e.target.value) } })} /></label>
          <label style={{ display: "block", marginTop: 8 }}>Revenue share % <input type="number" value={config.monetization.revenueSharePercent} onChange={(e) => setConfig({ ...config, monetization: { ...config.monetization, revenueSharePercent: Number(e.target.value) } })} /></label>

          <h3 style={{ marginTop: 24 }}>Play button / view counting</h3>
          <label>Min seconds to count a view <input type="number" value={config.playButton.minWatchSecondsToCountView} onChange={(e) => setConfig({ ...config, playButton: { ...config.playButton, minWatchSecondsToCountView: Number(e.target.value) } })} /></label>
          <label style={{ display: "block", marginTop: 8 }}>Max fraud score for play <input type="number" value={config.playButton.maxFraudScoreForPlay} onChange={(e) => setConfig({ ...config, playButton: { ...config.playButton, maxFraudScoreForPlay: Number(e.target.value) } })} /></label>

          <h3 style={{ marginTop: 24 }}>NSFW / content safety</h3>
          <label><input type="checkbox" checked={config.contentModeration?.enabled ?? true} onChange={(e) => setConfig({ ...config, contentModeration: { ...config.contentModeration!, enabled: e.target.checked, nsfwBlockThreshold: config.contentModeration?.nsfwBlockThreshold ?? 0.55, requireThumbnail: config.contentModeration?.requireThumbnail ?? true, summary: config.contentModeration?.summary ?? [] } })} /> Auto-scan videos before publish</label>
          <label style={{ display: "block", marginTop: 8 }}>Block threshold (0–1) <input type="number" step="0.05" min="0" max="1" value={config.contentModeration?.nsfwBlockThreshold ?? 0.55} onChange={(e) => setConfig({ ...config, contentModeration: { ...config.contentModeration!, enabled: config.contentModeration?.enabled ?? true, nsfwBlockThreshold: Number(e.target.value), requireThumbnail: config.contentModeration?.requireThumbnail ?? true, summary: config.contentModeration?.summary ?? [] } })} /></label>
          <p className="muted" style={{ marginTop: 8 }}>Set GOOGLE_VISION_API_KEY and/or SIGHTENGINE_API_USER + SIGHTENGINE_API_SECRET on the API server for AI vision scans.</p>

          <h3 style={{ marginTop: 24 }}>Notifications</h3>
          <label><input type="checkbox" checked={config.notifications.notifySubscribersOnNewVideo} onChange={(e) => setConfig({ ...config, notifications: { ...config.notifications, notifySubscribersOnNewVideo: e.target.checked } })} /> Notify subscribers on new video</label>
          <label style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={config.notifications.subscribersNotifiedFirst} onChange={(e) => setConfig({ ...config, notifications: { ...config.notifications, subscribersNotifiedFirst: e.target.checked } })} /> Subscribers see new videos first in feed</label>

          <button type="button" className="primary-btn" style={{ marginTop: 20 }} disabled={busy} onClick={saveConfig}>Save rules</button>
          <p className="muted" style={{ marginTop: 12 }}>These rules are shown on creator profiles in the mobile app.</p>
        </div>
      ) : null}

      {subTab === "moderation" ? (
        <>
          <div className="muted" style={{ marginBottom: 12, padding: 12, background: "#f0f7f4", borderRadius: 8, border: "1px solid #c8e6d4" }}>
            <strong>Manual approval — pehle video dekho, phir approve</strong>
            <p style={{ margin: "6px 0 0" }}>
              Har pending video par <strong>▶ Preview</strong> dabao, video play karke kam se kam {MIN_PREVIEW_SEC}s dekho.
              Uske baad hi <strong>Approve</strong> button active hoga.
            </p>
          </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Video</th><th>Channel</th><th>Duration</th><th>Status</th><th>Reason</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {moderationQueue.map((v) => (
                <tr key={v.id}>
                  <td><strong>{v.title}</strong><div className="muted" style={{ fontSize: 12 }}>#{v.id}</div></td>
                  <td>@{v.channel_handle}</td>
                  <td>{v.duration_seconds ? `${v.duration_seconds}s` : "—"}</td>
                  <td>{v.moderation_status || v.status}</td>
                  <td style={{ maxWidth: 200 }}>{v.moderation_reason ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="nav-btn" onClick={() => openPreview(v)}>▶ Preview</button>{" "}
                    <button
                      type="button"
                      className="primary-btn"
                      disabled={!previewReadyIds.has(v.id)}
                      title={previewReadyIds.has(v.id) ? "Approve & publish" : "Pehle Preview se video dekhein"}
                      onClick={() => void approveVideo(v.id, v.title)}
                    >
                      Approve
                    </button>{" "}
                    <button type="button" className="nav-btn" onClick={() => void rejectVideo(v.id)}>Reject</button>
                    {previewReadyIds.has(v.id) ? (
                      <span style={{ color: "#0a7", fontSize: 11, marginLeft: 6 }}>✓ previewed</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {moderationQueue.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>Koi pending video nahi — sab approved ya queue khali hai.</p>
          ) : null}
        </div>
          {previewVideo ? (
            <div
              role="dialog"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.65)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
              }}
              onClick={closePreview}
            >
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  maxWidth: 900,
                  width: "100%",
                  maxHeight: "90vh",
                  overflow: "auto",
                  padding: 20,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{previewVideo.title}</h3>
                    <p className="muted" style={{ margin: "4px 0 0" }}>@{previewVideo.channel_handle} · #{previewVideo.id}</p>
                  </div>
                  <button type="button" className="nav-btn" onClick={closePreview}>✕ Close</button>
                </div>
                {previewPlaybackUrl(previewVideo) ? (
                  <>
                    <p style={{ marginTop: 12, fontSize: 13, color: "#444" }}>
                      <strong>Step 1:</strong> Neeche video player par <strong>▶ Play</strong> dabayein.
                      {" "}<strong>Step 2:</strong> Kam se kam <strong>{previewRequired}s</strong> dekhein — tabhi Approve khulega.
                    </p>
                    {previewVideo.file_on_server === false ? (
                      <p style={{ color: "#b45309", marginTop: 8, fontSize: 13 }}>
                        ⚠ Video file server par nahi mili (server restart ke baad upload gayab ho sakta hai).
                        User se dubara upload karwayein, ya Reject karein.
                      </p>
                    ) : null}
                    <video
                      key={previewVideo.id}
                      ref={videoRef}
                      src={previewPlaybackUrl(previewVideo)}
                      controls
                      playsInline
                      preload="metadata"
                      style={{ width: "100%", marginTop: 12, borderRadius: 8, background: "#000", maxHeight: 420 }}
                      onTimeUpdate={onVideoTimeUpdate}
                      onEnded={onVideoEnded}
                      onError={() => {
                        setPreviewPlayError(
                          "Video load nahi hui — API redeploy karein, ya file server par missing hai. "
                          + "Neeche Open link try karein.",
                        );
                      }}
                      poster={previewVideo.thumbnail_url}
                    />
                    {previewPlayError ? (
                      <p style={{ color: "#c00", marginTop: 8, fontSize: 13 }}>{previewPlayError}</p>
                    ) : null}
                    {previewVideo.video_url ? (
                      <p style={{ marginTop: 8, fontSize: 12 }}>
                        <a href={previewPlaybackUrl(previewVideo)} target="_blank" rel="noreferrer">
                          Video nayi tab mein kholein
                        </a>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p style={{ color: "#c00", marginTop: 16 }}>Video URL missing — server se file check karein.</p>
                )}
                <p style={{ marginTop: 12, fontSize: 14 }}>
                  Watch progress: <strong>{previewProgress.toFixed(1)}s</strong> / {previewRequired}s required
                  {previewReadyIds.has(previewVideo.id) ? " — ✓ Ready to approve" : previewLogging ? " — saving…" : ""}
                </p>
                {previewVideo.description ? (
                  <p className="muted" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{previewVideo.description}</p>
                ) : null}
                <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="primary-btn"
                    disabled={!previewReadyIds.has(previewVideo.id)}
                    onClick={() => void approveVideo(previewVideo.id, previewVideo.title)}
                  >
                    Approve after preview
                  </button>
                  <button type="button" className="nav-btn" onClick={() => void rejectVideo(previewVideo.id)}>Reject</button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {subTab === "fraud" ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Time</th><th>Entity</th><th>Signal</th><th>Score +</th></tr>
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
        </div>
      ) : null}
    </div>
  );
}
