import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { VideoCard } from "@/components/VideoCard";
import {
  createPlaylist,
  fetchLibrary,
  formatDuration,
  normalizeUrl,
  videoThumbnailSrc,
  type ReelsPlaylist,
  type ReelsVideo,
} from "@/lib/reelsApi";
import { listOfflineVideos, type OfflineVideo } from "@/lib/offlineDownloads";
import { navigate } from "@/lib/router";
import { getLocalWatchHistory, type LocalHistoryEntry } from "@/lib/watchHistory";

function mergeHistory(
  server: ReelsVideo[],
  local: LocalHistoryEntry[],
): ReelsVideo[] {
  const seen = new Set<number>();
  const out: ReelsVideo[] = [];
  for (const v of server) {
    if (!seen.has(v.id)) {
      seen.add(v.id);
      out.push(v);
    }
  }
  for (const e of local) {
    if (!seen.has(e.video.id)) {
      seen.add(e.video.id);
      out.push(e.video);
    }
  }
  return out.slice(0, 30);
}

function RailVideoCard({ video }: { video: ReelsVideo }) {
  const channelLabel = video.channelDisplayName || (video.channelHandle ? `@${video.channelHandle}` : "Videh");
  return (
    <article className="yt-lib-card">
      <div
        className="yt-lib-thumb"
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/watch/${video.id}`)}
        onKeyDown={(e) => e.key === "Enter" && navigate(`/watch/${video.id}`)}
      >
        <img src={videoThumbnailSrc(video)} alt="" loading="lazy" />
        <span className="yt-duration">{formatDuration(video.durationSeconds)}</span>
      </div>
      <h3
        className="yt-lib-title"
        role="link"
        tabIndex={0}
        onClick={() => navigate(`/watch/${video.id}`)}
        onKeyDown={(e) => e.key === "Enter" && navigate(`/watch/${video.id}`)}
      >
        {video.title}
      </h3>
      <p className="yt-lib-sub">{channelLabel}</p>
    </article>
  );
}

function PlaylistCard({
  playlist,
  handle,
  onOpen,
}: {
  playlist: ReelsPlaylist;
  handle: string;
  onOpen: () => void;
}) {
  const thumb = normalizeUrl(playlist.thumbnailUrl);
  return (
    <article className="yt-lib-card yt-lib-playlist">
      <div
        className="yt-lib-thumb yt-lib-pl-thumb"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === "Enter" && onOpen()}
      >
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" />
        ) : (
          <span className="yt-lib-pl-empty">▶</span>
        )}
        <span className="yt-lib-pl-count">{playlist.videoCount ?? 0}</span>
      </div>
      <h3 className="yt-lib-title" role="link" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
        {playlist.title}
      </h3>
      <p className="yt-lib-sub">{handle ? "Playlist" : "Private"}</p>
    </article>
  );
}

function SectionHeader({
  title,
  onSeeAll,
  action,
}: {
  title: string;
  onSeeAll?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="yt-lib-section-head">
      <button type="button" className="yt-lib-section-title" onClick={onSeeAll}>
        {title}
        {onSeeAll ? <span aria-hidden> ›</span> : null}
      </button>
      {action}
    </div>
  );
}

function HorizontalRail({ children }: { children: React.ReactNode }) {
  return <div className="yt-lib-rail">{children}</div>;
}

export function LibraryPage({ section }: { section?: "downloads" | "liked" | "history" }) {
  const { user } = useAuth();
  const [history, setHistory] = useState<ReelsVideo[]>([]);
  const [liked, setLiked] = useState<ReelsVideo[]>([]);
  const [playlists, setPlaylists] = useState<ReelsPlaylist[]>([]);
  const [myVideos, setMyVideos] = useState<ReelsVideo[]>([]);
  const [channelHandle, setChannelHandle] = useState<string | null>(null);
  const [offline, setOffline] = useState<OfflineVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [newPlaylist, setNewPlaylist] = useState("");
  const [creatingPl, setCreatingPl] = useState(false);

  const displayName = user?.name || user?.phone || "You";
  const initial = (displayName[0] ?? "V").toUpperCase();

  const load = async () => {
    setErr("");
    const local = getLocalWatchHistory();
    setOffline(listOfflineVideos());

    if (!user) {
      setHistory(mergeHistory([], local));
      setLiked([]);
      setPlaylists([]);
      setMyVideos([]);
      setChannelHandle(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetchLibrary(user.dbId, user.sessionToken);
      if (!res.success) {
        setErr(res.message ?? "Could not load library");
        setHistory(mergeHistory([], getLocalWatchHistory()));
        return;
      }
      setHistory(mergeHistory(res.history ?? [], getLocalWatchHistory()));
      setLiked(res.liked ?? []);
      setPlaylists(res.playlists ?? []);
      setMyVideos(res.myVideos ?? []);
      setChannelHandle(res.channel?.handle ?? null);
    } catch {
      setErr("Could not load library");
      setHistory(mergeHistory([], getLocalWatchHistory()));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    document.title = "Library — Videh Video";
  }, [user]);

  useEffect(() => {
    if (!section) return;
    const el = document.getElementById(`lib-${section}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [section, loading]);

  const likedPlaylist: ReelsPlaylist = useMemo(
    () => ({
      id: -1,
      title: "Liked videos",
      videoCount: liked.length,
      thumbnailUrl: liked[0] ? videoThumbnailSrc(liked[0]) : null,
    }),
    [liked],
  );

  const watchLaterPlaylist: ReelsPlaylist = useMemo(
    () => ({
      id: -2,
      title: "Watch Later",
      videoCount: 0,
      thumbnailUrl: null,
    }),
    [],
  );

  const allPlaylists = useMemo(
    () => [likedPlaylist, watchLaterPlaylist, ...playlists],
    [likedPlaylist, watchLaterPlaylist, playlists],
  );

  const onCreatePlaylist = async () => {
    const title = newPlaylist.trim();
    if (!user || !title) return;
    setCreatingPl(true);
    try {
      const res = await createPlaylist(user.dbId, title, user.sessionToken);
      if (res.success && res.playlists) {
        setPlaylists(res.playlists);
        setNewPlaylist("");
      } else {
        setErr(res.message ?? "Could not create playlist. Create your channel first.");
      }
    } finally {
      setCreatingPl(false);
    }
  };

  const openPlaylist = (pl: ReelsPlaylist) => {
    if (pl.id === -1) {
      navigate("/library/liked");
      return;
    }
    if (pl.id === -2) return;
    if (!channelHandle) {
      setErr("Create your channel to manage playlists.");
      navigate("/studio");
      return;
    }
    navigate(`/playlist/${channelHandle}/${pl.id}`);
  };

  if (loading) return <p className="center-msg">Loading library…</p>;

  return (
    <div className="yt-library">
      <header className="yt-lib-profile">
        <div className="yt-lib-avatar" aria-hidden>{initial}</div>
        <div>
          <h1>{displayName}</h1>
          {channelHandle ? (
            <button type="button" className="yt-lib-channel-link" onClick={() => navigate(`/@${channelHandle}`)}>
              View channel ›
            </button>
          ) : user ? (
            <button type="button" className="yt-lib-channel-link" onClick={() => navigate("/studio")}>
              Create your channel ›
            </button>
          ) : (
            <button type="button" className="yt-lib-channel-link" onClick={() => navigate("/login?redirect=/library")}>
              Sign in to sync library ›
            </button>
          )}
        </div>
      </header>

      {err ? <p className="center-msg error">{err}</p> : null}

      <section className="yt-lib-block" id="lib-history">
        <SectionHeader title="History" onSeeAll={() => navigate("/library/history")} />
        {history.length ? (
          <HorizontalRail>
            {history.map((v) => <RailVideoCard key={v.id} video={v} />)}
          </HorizontalRail>
        ) : (
          <p className="yt-lib-empty">Videos you watch will show up here.</p>
        )}
      </section>

      <section className="yt-lib-block">
        <SectionHeader
          title="Playlists"
          onSeeAll={() => channelHandle && navigate(`/@${channelHandle}`)}
          action={
            user ? (
              <div className="yt-lib-pl-create">
                <input
                  value={newPlaylist}
                  onChange={(e) => setNewPlaylist(e.target.value)}
                  placeholder="New playlist"
                  aria-label="New playlist name"
                />
                <button type="button" disabled={creatingPl || !newPlaylist.trim()} onClick={() => void onCreatePlaylist()}>
                  +
                </button>
              </div>
            ) : null
          }
        />
        <HorizontalRail>
          {allPlaylists.map((pl) => (
            <PlaylistCard
              key={pl.id}
              playlist={pl}
              handle={channelHandle ?? ""}
              onOpen={() => openPlaylist(pl)}
            />
          ))}
        </HorizontalRail>
      </section>

      <nav className="yt-lib-menu" aria-label="Library">
        <button type="button" className="yt-lib-menu-item" onClick={() => navigate("/studio")}>
          <span aria-hidden>▣</span> Your videos
          {myVideos.length ? <span className="yt-lib-menu-meta">{myVideos.length}</span> : null}
        </button>
        <button type="button" className="yt-lib-menu-item" onClick={() => navigate("/library/downloads")}>
          <span aria-hidden>↓</span> Downloads
          {offline.length ? <span className="yt-lib-menu-meta">{offline.length}</span> : null}
        </button>
        <button type="button" className="yt-lib-menu-item" onClick={() => navigate("/library/liked")}>
          <span aria-hidden>♥</span> Liked videos
          {liked.length ? <span className="yt-lib-menu-meta">{liked.length}</span> : null}
        </button>
      </nav>

      {(section === "history" || section === "liked" || section === "downloads") && (
        <section className="yt-lib-block yt-lib-full" id={`lib-${section}`}>
          <h2>
            {section === "history" ? "Watch history" : section === "liked" ? "Liked videos" : "Downloads"}
          </h2>
          {section === "downloads" ? (
            offline.length ? (
              <div className="yt-grid">
                {offline.map((e) => <VideoCard key={e.video.id} video={e.video} />)}
              </div>
            ) : (
              <p className="yt-lib-empty">
                Tap Download on a video while watching to save it for offline viewing in this browser.
              </p>
            )
          ) : null}
          {section === "history" ? (
            history.length ? (
              <div className="yt-grid">
                {history.map((v) => <VideoCard key={v.id} video={v} />)}
              </div>
            ) : (
              <p className="yt-lib-empty">No watch history yet.</p>
            )
          ) : null}
          {section === "liked" ? (
            liked.length ? (
              <div className="yt-grid">
                {liked.map((v) => <VideoCard key={v.id} video={v} />)}
              </div>
            ) : user ? (
              <p className="yt-lib-empty">Videos you like will appear here.</p>
            ) : (
              <p className="yt-lib-empty">
                <button type="button" className="yt-signin-btn" onClick={() => navigate("/login?redirect=/library/liked")}>
                  Sign in
                </button>
                {" "}to see liked videos.
              </p>
            )
          ) : null}
        </section>
      )}
    </div>
  );
}
