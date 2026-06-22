-- Audit log for every image/video stored on S3 (who uploaded, when, URL, size, context).
CREATE TABLE IF NOT EXISTS s3_media_uploads (
  id BIGSERIAL PRIMARY KEY,
  stored_url TEXT NOT NULL,
  s3_bucket TEXT,
  s3_key TEXT NOT NULL,
  cdn_url TEXT,
  media_type TEXT NOT NULL DEFAULT 'other',
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  original_filename TEXT,
  source_app TEXT NOT NULL,
  source_context TEXT,
  upload_method TEXT NOT NULL DEFAULT 'server_proxy',
  uploader_type TEXT NOT NULL DEFAULT 'system',
  uploader_user_id TEXT,
  uploader_advertiser_id INTEGER,
  uploader_email TEXT,
  entity_type TEXT,
  entity_id BIGINT,
  ip_address INET,
  user_agent TEXT,
  upload_status TEXT NOT NULL DEFAULT 'completed',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_created_at ON s3_media_uploads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_user ON s3_media_uploads (uploader_user_id) WHERE uploader_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_advertiser ON s3_media_uploads (uploader_advertiser_id) WHERE uploader_advertiser_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_stored_url ON s3_media_uploads (stored_url);
CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_s3_key ON s3_media_uploads (s3_key);
CREATE INDEX IF NOT EXISTS idx_s3_media_uploads_source_app ON s3_media_uploads (source_app, created_at DESC);

COMMENT ON TABLE s3_media_uploads IS 'Audit trail for images/videos uploaded to AWS S3 via Videh apps.';
COMMENT ON COLUMN s3_media_uploads.uploader_user_id IS 'Videh user id (UUID or numeric string) — no FK for cross-schema compatibility.';
