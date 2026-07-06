-- Google sign-in for ads.videh.co.in advertiser accounts
ALTER TABLE reels_advertisers ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE reels_advertisers ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'password';
CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_advertisers_google_sub
  ON reels_advertisers (google_sub) WHERE google_sub IS NOT NULL;
