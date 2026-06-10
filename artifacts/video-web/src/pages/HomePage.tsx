import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { VideoCard } from "@/components/VideoCard";
import { fetchFeed, type ReelsFeedCursor, type ReelsVideo } from "@/lib/reelsApi";

export function HomePage() {
  const { user } = useAuth();
  const userId = user?.dbId ?? 0;
  const token = user?.sessionToken;
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [trending, setTrending] = useState<ReelsVideo[]>([]);
  const [cursor, setCursor] = useState<ReelsFeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFeed(userId, null, token)
      .then((res) => {
        if (cancelled) return;
        setVideos(res.videos ?? []);
        setTrending(res.trending ?? []);
        setCursor(res.nextCursor);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, token]);

  const loadMore = async () => {
    if (!cursor || moreLoading) return;
    setMoreLoading(true);
    try {
      const res = await fetchFeed(userId, cursor, token);
      setVideos((prev) => [...prev, ...(res.videos ?? [])]);
      setCursor(res.nextCursor);
    } finally {
      setMoreLoading(false);
    }
  };

  if (loading) return <p className="center-msg">Loading feed…</p>;

  return (
    <div className="page-home">
      {trending.length > 0 ? (
        <section>
          <h2 className="section-title">Trending</h2>
          <div className="video-grid">
            {trending.map((v) => <VideoCard key={`t-${v.id}`} video={v} />)}
          </div>
        </section>
      ) : null}
      <section>
        <h2 className="section-title">Recommended</h2>
        <div className="video-grid">
          {videos.map((v) => <VideoCard key={v.id} video={v} />)}
        </div>
        {cursor ? (
          <div className="load-more">
            <button type="button" onClick={loadMore} disabled={moreLoading}>
              {moreLoading ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
