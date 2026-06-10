import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { VideoCard } from "@/components/VideoCard";
import {
  channelAvatarSrc,
  channelCoverSrc,
  fetchChannel,
  formatCount,
  subscribeChannel,
  unsubscribeChannel,
  type ReelsChannel,
  type ReelsVideo,
} from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

export function ChannelPage({ handle }: { handle: string }) {
  const { user } = useAuth();
  const userId = user?.dbId ?? 0;
  const token = user?.sessionToken;
  const [channel, setChannel] = useState<ReelsChannel | null>(null);
  const [videos, setVideos] = useState<ReelsVideo[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchChannel(handle, userId || undefined, token)
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.channel) {
          setError(res.message ?? "Channel not found");
          return;
        }
        setChannel(res.channel);
        setVideos(res.videos ?? []);
      })
      .catch(() => { if (!cancelled) setError("Could not load channel"); });
    return () => { cancelled = true; };
  }, [handle, userId, token]);

  const toggleSub = async () => {
    if (!user || !channel) {
      navigate(`/login?redirect=${encodeURIComponent(`/@${handle}`)}`);
      return;
    }
    if (channel.isSubscribed) {
      await unsubscribeChannel(channel.id, user.dbId, user.sessionToken);
      setChannel({ ...channel, isSubscribed: false, subscriberCount: channel.subscriberCount - 1 });
    } else {
      await subscribeChannel(channel.id, user.dbId, user.sessionToken);
      setChannel({ ...channel, isSubscribed: true, subscriberCount: channel.subscriberCount + 1 });
    }
  };

  if (error) return <p className="center-msg error">{error}</p>;
  if (!channel) return <p className="center-msg">Loading channel…</p>;

  const title = channel.displayName || `@${channel.handle}`;

  return (
    <div className="page-channel">
      <div
        className="channel-banner"
        style={{ backgroundImage: `url(${channelCoverSrc(channel.id)})` }}
      />
      <div className="channel-head">
        <img src={channelAvatarSrc(channel.id)} alt="" className="channel-avatar-lg-img" />
        <div>
          <h1>{title}</h1>
          <p>@{channel.handle} · {formatCount(channel.subscriberCount)} subscribers · {formatCount(channel.totalViews)} views</p>
          {channel.bio ? <p className="bio">{channel.bio}</p> : null}
          {channel.isOwner ? (
            <button type="button" className="btn-primary" onClick={() => navigate("/studio")}>
              Manage channel
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={toggleSub}>
              {channel.isSubscribed ? "Subscribed" : "Subscribe"}
            </button>
          )}
        </div>
      </div>
      <h2 className="section-title">Videos</h2>
      <div className="video-grid">
        {videos.map((v) => <VideoCard key={v.id} video={v} />)}
      </div>
      {videos.length === 0 ? <p className="center-msg">No videos yet.</p> : null}
    </div>
  );
}
