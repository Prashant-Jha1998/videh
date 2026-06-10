import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { CategoryChips } from "@/components/CategoryChips";
import { FeedAdCard } from "@/components/FeedAdCard";
import { VideoCard } from "@/components/VideoCard";
import { buildFeedRows } from "@/lib/feedRows";
import {
  fetchFeed,
  searchReels,
  type ReelsFeedAdPlacement,
  type ReelsFeedCursor,
  type ReelsVideo,
} from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

export function HomePage() {
  const { user } = useAuth();
  const userId = user?.dbId ?? 0;
  const token = user?.sessionToken;
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [adPlacements, setAdPlacements] = useState<ReelsFeedAdPlacement[]>([]);
  const [cursor, setCursor] = useState<ReelsFeedCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [chip, setChip] = useState("All");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = chip === "All"
      ? fetchFeed(userId, null, token)
      : searchReels(chip, userId, token).then((res) => ({
          videos: res.videos ?? [],
          trending: [],
          nextCursor: null,
          feedAdPlacements: [] as ReelsFeedAdPlacement[],
        }));

    load
      .then((res) => {
        if (cancelled) return;
        setVideos(res.videos ?? []);
        setAdPlacements(res.feedAdPlacements ?? []);
        setCursor(res.nextCursor ?? null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, token, chip]);

  const rows = useMemo(() => buildFeedRows(videos, adPlacements), [videos, adPlacements]);

  const loadMore = async () => {
    if (!cursor || moreLoading || chip !== "All") return;
    setMoreLoading(true);
    try {
      const res = await fetchFeed(userId, cursor, token);
      setVideos((prev) => [...prev, ...(res.videos ?? [])]);
      setAdPlacements((prev) => [...prev, ...(res.feedAdPlacements ?? [])]);
      setCursor(res.nextCursor);
    } finally {
      setMoreLoading(false);
    }
  };

  return (
    <div className="yt-home">
      <CategoryChips active={chip} onChange={setChip} />
      {loading ? (
        <div className="yt-loading">
          <div className="yt-spinner" />
          <p>Loading videos…</p>
        </div>
      ) : (
        <>
          <div className="yt-grid">
            {rows.map((row) =>
              row.kind === "ad" ? (
                <FeedAdCard key={row.key} ad={row.ad} />
              ) : (
                <VideoCard key={row.key} video={row.video} />
              ),
            )}
          </div>
          {rows.length === 0 ? (
            <p className="center-msg">No videos yet. <button type="button" className="link-btn" onClick={() => navigate("/upload")}>Upload the first one</button></p>
          ) : null}
          {cursor && chip === "All" ? (
            <div className="load-more">
              <button type="button" onClick={loadMore} disabled={moreLoading}>
                {moreLoading ? "Loading…" : "Show more"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
