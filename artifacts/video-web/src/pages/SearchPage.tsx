import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { VideoCard } from "@/components/VideoCard";
import { formatCount, searchReels, type ReelsChannel, type ReelsVideo } from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

export function SearchPage({ q }: { q: string }) {
  const { user } = useAuth();
  const userId = user?.dbId ?? 0;
  const token = user?.sessionToken;
  const [channels, setChannels] = useState<ReelsChannel[]>([]);
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q.trim()) {
      setChannels([]);
      setVideos([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchReels(q, userId, token)
      .then((res) => {
        if (cancelled) return;
        setChannels(res.channels ?? []);
        setVideos(res.videos ?? []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [q, userId, token]);

  if (!q.trim()) return <p className="center-msg">Enter a search term above.</p>;
  if (loading) return <p className="center-msg">Searching…</p>;

  return (
    <div className="page-search">
      <h1>Results for “{q}”</h1>
      {channels.length > 0 ? (
        <section>
          <h2 className="section-title">Channels</h2>
          <ul className="channel-list">
            {channels.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => navigate(`/@${c.handle}`)}>
                  {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : <span className="av-fallback" />}
                  <span>
                    <strong>{c.displayName || `@${c.handle}`}</strong>
                    <small>{formatCount(c.subscriberCount)} subscribers</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h2 className="section-title">Videos</h2>
        <div className="video-grid">
          {videos.map((v) => <VideoCard key={v.id} video={v} />)}
        </div>
        {videos.length === 0 && channels.length === 0 ? (
          <p className="center-msg">No results.</p>
        ) : null}
      </section>
    </div>
  );
}
