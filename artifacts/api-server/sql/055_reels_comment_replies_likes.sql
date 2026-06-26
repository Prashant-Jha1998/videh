-- Reels comments: threaded replies + per-comment likes (in-stream video)

ALTER TABLE reels_video_comments
  ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES reels_video_comments(id) ON DELETE CASCADE;

ALTER TABLE reels_video_comments
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reels_video_comment_likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment_id INTEGER NOT NULL REFERENCES reels_video_comments(id) ON DELETE CASCADE,
  reaction VARCHAR(10) NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, comment_id)
);

CREATE INDEX IF NOT EXISTS idx_reels_comments_parent
  ON reels_video_comments (parent_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_reels_comments_top_level
  ON reels_video_comments (video_id, created_at DESC)
  WHERE parent_id IS NULL;
