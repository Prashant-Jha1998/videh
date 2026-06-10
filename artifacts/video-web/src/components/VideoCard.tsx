import type { ReelsVideo } from "@/lib/reelsApi";
import { formatCount, formatDuration, timeAgo } from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

export function VideoCard({ video }: { video: ReelsVideo }) {
  const channelLabel = video.channelDisplayName || (video.channelHandle ? `@${video.channelHandle}` : "Videh");
  return (
    <article
      className="video-card"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/watch/${video.id}`)}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/watch/${video.id}`)}
    >
      <div className="thumb-wrap">
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <div className="thumb-fallback" />
        )}
        <span className="duration">{formatDuration(video.durationSeconds)}</span>
      </div>
      <div className="meta">
        <div
          className="avatar"
          style={video.channelAvatarUrl ? { backgroundImage: `url(${video.channelAvatarUrl})` } : undefined}
        />
        <div>
          <h3>{video.title}</h3>
          <p className="channel" onClick={(e) => {
            e.stopPropagation();
            if (video.channelHandle) navigate(`/@${video.channelHandle}`);
          }}>
            {channelLabel}
          </p>
          <p className="stats">
            {formatCount(video.viewCount)} views · {timeAgo(video.createdAt)}
          </p>
        </div>
      </div>
    </article>
  );
}
