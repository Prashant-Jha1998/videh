import type { ReelsVideo } from "@/lib/reelsApi";
import { formatCount, formatDuration, timeAgo, videoThumbnailSrc } from "@/lib/reelsApi";
import { navigate } from "@/lib/router";

export function VideoCard({ video }: { video: ReelsVideo }) {
  const channelLabel = video.channelDisplayName || (video.channelHandle ? `@${video.channelHandle}` : "Videh");
  return (
    <article className="yt-video-card">
      <div
        className="yt-thumb"
        role="button"
        tabIndex={0}
        onClick={() => navigate(`/watch/${video.id}`)}
        onKeyDown={(e) => e.key === "Enter" && navigate(`/watch/${video.id}`)}
      >
        <img
          src={videoThumbnailSrc(video)}
          alt=""
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            const fallback = `/api/reels/videos/${video.id}/thumbnail`;
            if (!img.src.endsWith(fallback)) img.src = fallback;
          }}
        />
        <span className="yt-duration">{formatDuration(video.durationSeconds)}</span>
      </div>
      <div className="yt-video-meta">
        <button
          type="button"
          className="yt-ch-avatar"
          style={video.channelAvatarUrl ? { backgroundImage: `url(${video.channelAvatarUrl})` } : undefined}
          onClick={() => video.channelHandle && navigate(`/@${video.channelHandle}`)}
          aria-label={channelLabel}
        />
        <div className="yt-video-text">
          <h3
            onClick={() => navigate(`/watch/${video.id}`)}
            role="link"
            tabIndex={0}
          >
            {video.title}
          </h3>
          <p
            className="yt-channel-name"
            onClick={() => video.channelHandle && navigate(`/@${video.channelHandle}`)}
          >
            {channelLabel}
          </p>
          <p className="yt-video-stats">
            {formatCount(video.viewCount)} views · {timeAgo(video.createdAt)}
          </p>
        </div>
        <button type="button" className="yt-card-menu" aria-label="Video options">⋮</button>
      </div>
    </article>
  );
}
