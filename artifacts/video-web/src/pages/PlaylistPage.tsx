import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { VideoCard } from "@/components/VideoCard";
import { fetchPlaylist, type ReelsPlaylist, type ReelsVideo } from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

export function PlaylistPage({ handle, playlistId }: { handle: string; playlistId: number }) {
  const { user } = useAuth();
  const [playlist, setPlaylist] = useState<ReelsPlaylist | null>(null);
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchPlaylist(handle, playlistId, user?.dbId, user?.sessionToken)
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.playlist) {
          setError(res.message ?? "Playlist not found");
          return;
        }
        setPlaylist(res.playlist);
        setVideos(res.videos ?? []);
      })
      .catch(() => { if (!cancelled) setError("Could not load playlist"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [handle, playlistId, user]);

  useEffect(() => {
    document.title = playlist ? `${playlist.title} — Videh Video` : "Playlist — Videh Video";
  }, [playlist]);

  if (loading) return <p className="center-msg">Loading playlist…</p>;
  if (error) return <p className="center-msg error">{error}</p>;
  if (!playlist) return null;

  return (
    <div className="yt-playlist-page">
      <button type="button" className="yt-back-link" onClick={() => navigate("/library")}>
        ← Library
      </button>
      <header className="yt-playlist-head">
        <h1>{playlist.title}</h1>
        {playlist.description ? <p>{playlist.description}</p> : null}
        <p className="yt-muted">{videos.length} videos</p>
      </header>
      {videos.length ? (
        <div className="yt-grid">
          {videos.map((v) => <VideoCard key={v.id} video={v} />)}
        </div>
      ) : (
        <p className="center-msg">This playlist is empty.</p>
      )}
    </div>
  );
}
