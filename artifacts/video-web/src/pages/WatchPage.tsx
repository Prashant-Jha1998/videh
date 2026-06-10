import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { VideoCard } from "@/components/VideoCard";
import {
  fetchComments,
  fetchFeed,
  fetchVideo,
  formatCount,
  postComment,
  reactVideo,
  recordView,
  subscribeChannel,
  unsubscribeChannel,
  videoStreamUrl,
  videoThumbnailSrc,
  type ReelsComment,
  type ReelsVideo,
} from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

export function WatchPage({ videoId }: { videoId: number }) {
  const { user } = useAuth();
  const userId = user?.dbId ?? 0;
  const token = user?.sessionToken;
  const [video, setVideo] = useState<ReelsVideo | null>(null);
  const [related, setRelated] = useState<ReelsVideo[]>([]);
  const [comments, setComments] = useState<ReelsComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [error, setError] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const watchedRef = useRef(0);
  const viewSentRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setError("");
    Promise.all([
      fetchVideo(videoId, userId, token),
      fetchFeed(userId, null, token),
      fetchComments(videoId, userId, token),
    ])
      .then(([vRes, feedRes, cRes]) => {
        if (cancelled) return;
        if (!vRes.success || !vRes.video) {
          setError(vRes.message ?? "Video not found");
          return;
        }
        setVideo(vRes.video);
        setRelated((feedRes.videos ?? []).filter((x) => x.id !== videoId).slice(0, 12));
        setComments(cRes.comments ?? []);
      })
      .catch(() => { if (!cancelled) setError("Could not load video"); });
    return () => { cancelled = true; };
  }, [videoId, userId, token]);

  useEffect(() => {
    document.title = video ? `${video.title} — Videh Video` : "Watch — Videh Video";
  }, [video]);

  const onTimeUpdate = (el: HTMLVideoElement) => {
    watchedRef.current = Math.floor(el.currentTime);
    if (!viewSentRef.current && watchedRef.current >= 30) {
      viewSentRef.current = true;
      recordView(videoId, userId, watchedRef.current, token).catch(() => {});
    }
  };

  const toggleLike = async () => {
    if (!user || !video) {
      navigate(`/login?redirect=${encodeURIComponent(`/watch/${videoId}`)}`);
      return;
    }
    const res = await reactVideo(videoId, user.dbId, "like", user.sessionToken);
    if (res.success) {
      setVideo({
        ...video,
        myReaction: video.myReaction === "like" ? null : "like",
        likeCount: video.myReaction === "like" ? video.likeCount - 1 : video.likeCount + 1,
      });
    }
  };

  const toggleSubscribe = async () => {
    if (!user || !video) {
      navigate(`/login?redirect=${encodeURIComponent(`/watch/${videoId}`)}`);
      return;
    }
    if (subscribed) {
      await unsubscribeChannel(video.channelId, user.dbId, user.sessionToken);
      setSubscribed(false);
    } else {
      await subscribeChannel(video.channelId, user.dbId, user.sessionToken);
      setSubscribed(true);
    }
  };

  const submitComment = async () => {
    if (!user || !commentText.trim()) return;
    const res = await postComment(videoId, user.dbId, commentText.trim(), user.sessionToken);
    if (res.success) {
      setCommentText("");
      const cRes = await fetchComments(videoId, user.dbId, user.sessionToken);
      setComments(cRes.comments ?? []);
    }
  };

  if (error) return <p className="center-msg error">{error}</p>;
  if (!video) return <p className="center-msg">Loading…</p>;

  const channelLabel = video.channelDisplayName || (video.channelHandle ? `@${video.channelHandle}` : "Channel");

  return (
    <div className="page-watch">
      <div className="watch-main">
        <video
          className="player"
          controls
          playsInline
          poster={videoThumbnailSrc(video)}
          src={videoStreamUrl(video.id)}
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget)}
        />
        <h1>{video.title}</h1>
        <div className="watch-actions">
          <span>{formatCount(video.viewCount)} views</span>
          <button type="button" onClick={toggleLike}>
            {video.myReaction === "like" ? "♥ Liked" : "♡ Like"} ({formatCount(video.likeCount)})
          </button>
          <button type="button" onClick={toggleSubscribe}>
            {subscribed ? "Subscribed" : "Subscribe"}
          </button>
        </div>
        <div className="channel-row">
          <button
            type="button"
            className="channel-link"
            onClick={() => video.channelHandle && navigate(`/@${video.channelHandle}`)}
          >
            {video.channelAvatarUrl ? (
              <img src={video.channelAvatarUrl} alt="" className="ch-avatar" />
            ) : (
              <span className="ch-avatar fallback" />
            )}
            <strong>{channelLabel}</strong>
          </button>
        </div>
        {video.description ? <p className="description">{video.description}</p> : null}
        {video.hashtags?.length ? (
          <p className="tags">{video.hashtags.map((t) => `#${t}`).join(" ")}</p>
        ) : null}

        <section className="comments">
          <h2>{formatCount(video.commentCount)} Comments</h2>
          {user ? (
            <div className="comment-form">
              <input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment…"
              />
              <button type="button" onClick={submitComment}>Post</button>
            </div>
          ) : (
            <p><button type="button" className="link-btn" onClick={() => navigate("/login")}>Sign in</button> to comment</p>
          )}
          <ul>
            {comments.map((c) => (
              <li key={c.id}>
                <strong>{c.displayName}</strong>
                <span>{c.content}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <aside className="watch-side">
        <h3>Up next</h3>
        {related.map((v) => <VideoCard key={v.id} video={v} />)}
      </aside>
    </div>
  );
}
